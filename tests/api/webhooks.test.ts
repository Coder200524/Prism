import http from "node:http";
import crypto from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlatformRole, EventRoleType } from "@prisma/client";
import { prisma } from "../../src/server/src/lib/prisma.js";
import {
  authHeader,
  clearFixedClock,
  createEvent,
  createUser,
  getTestApp,
  grantEventRole,
  resetDatabase,
} from "../helpers/index.js";
import { processPendingDeliveries } from "../../src/server/src/modules/webhooks/webhooks.service.js";

describe("Signed Webhooks API with Retries & SSRF Defenses", () => {
  const app = getTestApp();
  let server: http.Server | null = null;
  let receivedRequests: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];

  beforeEach(() => {
    clearFixedClock();
    receivedRequests = [];
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server!.close(resolve));
      server = null;
    }
  });

  function startMockReceiver(): Promise<number> {
    return new Promise((resolve) => {
      server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          receivedRequests.push({ headers: req.headers, body });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ received: true }));
        });
      });
      server.listen(0, "127.0.0.1", () => {
        const address = server!.address() as any;
        resolve(address.port);
      });
    });
  }

  async function setupTestContext() {
    await resetDatabase();
    const id = Math.random().toString(36).substring(7);

    const organizer = await createUser({
      email: `organizer_${id}@webhooks.local`,
      name: "Webhook Organizer",
      platformRole: PlatformRole.ORGANIZER,
    });

    const regularUser = await createUser({
      email: `user_${id}@webhooks.local`,
      name: "Regular User",
      platformRole: PlatformRole.USER,
    });

    const event = await createEvent({
      name: "Webhook Hackathon",
      description: "Testing webhooks",
    });

    await grantEventRole(organizer.id, event.id, EventRoleType.ORGANIZER);

    return { organizer, regularUser, event };
  }

  describe("Webhook CRUD", () => {
    it("allows organizers to create, list, view, update, and delete webhooks", async () => {
      const { organizer, event } = await setupTestContext();

      const createRes = await request(app)
        .post(`/api/events/${event.id}/webhooks`)
        .set(authHeader(organizer.token))
        .send({
          url: "https://example.com/webhook",
          secret: "super-secret-signing-key",
          events: ["project.submitted", "team.created"],
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.webhook.url).toBe("https://example.com/webhook");
      expect(createRes.body.webhook.secret).toBeDefined(); // Secret returned ONCE on creation
      expect(createRes.body.webhook.events).toEqual(["project.submitted", "team.created"]);
      const webhookId = createRes.body.webhook.id;

      // List webhooks
      const listRes = await request(app)
        .get(`/api/events/${event.id}/webhooks`)
        .set(authHeader(organizer.token));
      expect(listRes.status).toBe(200);
      expect(listRes.body.webhooks).toHaveLength(1);

      // Get webhook detail
      const getRes = await request(app)
        .get(`/api/webhooks/${webhookId}`)
        .set(authHeader(organizer.token));
      expect(getRes.status).toBe(200);
      expect(getRes.body.webhook.url).toBe("https://example.com/webhook");
      expect(getRes.body.webhook.secret).toBeUndefined(); // Secret omitted on GET

      // Update webhook
      const patchRes = await request(app)
        .patch(`/api/webhooks/${webhookId}`)
        .set(authHeader(organizer.token))
        .send({
          events: ["project.submitted"],
          active: false,
        });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.webhook.events).toEqual(["project.submitted"]);
      expect(patchRes.body.webhook.active).toBe(false);

      // Delete webhook
      const deleteRes = await request(app)
        .delete(`/api/webhooks/${webhookId}`)
        .set(authHeader(organizer.token));
      expect(deleteRes.status).toBe(204);
    });

    it("rejects unauthorized and non-organizer access to webhooks", async () => {
      const { regularUser, event } = await setupTestContext();

      const res401 = await request(app)
        .get(`/api/events/${event.id}/webhooks`);
      expect(res401.status).toBe(401);

      const res403 = await request(app)
        .post(`/api/events/${event.id}/webhooks`)
        .set(authHeader(regularUser.token))
        .send({
          url: "https://example.com/webhook",
          events: ["project.submitted"],
        });
      expect(res403.status).toBe(403);
    });
  });

  describe("SSRF Validation", () => {
    it("rejects cloud metadata and link-local IP addresses", async () => {
      const { organizer, event } = await setupTestContext();

      const res = await request(app)
        .post(`/api/events/${event.id}/webhooks`)
        .set(authHeader(organizer.token))
        .send({
          url: "http://169.254.169.254/latest/meta-data/",
          events: ["project.submitted"],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("bad_request");
      expect(res.body.error.message).toMatch(/SSRF/i);
    });

    it("rejects private range IP addresses when WEBHOOKS_ALLOW_PRIVATE is false", async () => {
      delete process.env.WEBHOOKS_ALLOW_PRIVATE;
      const { organizer, event } = await setupTestContext();

      const res = await request(app)
        .post(`/api/events/${event.id}/webhooks`)
        .set(authHeader(organizer.token))
        .send({
          url: "http://192.168.1.1/webhook",
          events: ["project.submitted"],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("bad_request");
    });
  });

  describe("Webhook Delivery & Signature Verification", () => {
    it("delivers signed webhook payload with X-Dogfood-Signature header", async () => {
      process.env.WEBHOOKS_ALLOW_PRIVATE = "true";
      const { organizer, event } = await setupTestContext();
      const port = await startMockReceiver();
      const secret = "test-webhook-secret-123";

      const webhookRes = await request(app)
        .post(`/api/events/${event.id}/webhooks`)
        .set(authHeader(organizer.token))
        .send({
          url: `http://127.0.0.1:${port}/webhook-test`,
          secret,
          events: ["ping", "project.submitted"],
        });
      expect(webhookRes.status).toBe(201);
      const webhookId = webhookRes.body.webhook.id;

      // Test endpoint (ping)
      const testRes = await request(app)
        .post(`/api/webhooks/${webhookId}/test`)
        .set(authHeader(organizer.token));
      expect(testRes.status).toBe(200);

      // Run pending deliveries
      await processPendingDeliveries();

      expect(receivedRequests).toHaveLength(1);
      const reqReceived = receivedRequests[0]!;

      // Verify headers
      expect(reqReceived.headers["content-type"]).toBe("application/json");
      expect(reqReceived.headers["x-dogfood-event"]).toBe("ping");
      
      const sigHeader = reqReceived.headers["x-dogfood-signature"] as string;
      expect(sigHeader).toBeDefined();
      expect(sigHeader).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);

      // Verify HMAC calculation: t + "." + rawBody
      const [tPart, v1Part] = sigHeader.split(",");
      const timestamp = tPart!.substring(2);
      const expectedHmac = crypto
        .createHmac("sha256", secret)
        .update(`${timestamp}.${reqReceived.body}`)
        .digest("hex");

      expect(v1Part!.substring(3)).toBe(expectedHmac);

      // Check delivery records list
      const delivRes = await request(app)
        .get(`/api/webhooks/${webhookId}/deliveries`)
        .set(authHeader(organizer.token));
      expect(delivRes.status).toBe(200);
      expect(delivRes.body.deliveries).toHaveLength(1);
      expect(delivRes.body.deliveries[0].status).toBe("succeeded");
      expect(delivRes.body.deliveries[0].lastStatusCode).toBe(200);
    });

    it("allows manual redelivery of a delivery", async () => {
      process.env.WEBHOOKS_ALLOW_PRIVATE = "true";
      const { organizer, event } = await setupTestContext();
      const port = await startMockReceiver();

      const webhookRes = await request(app)
        .post(`/api/events/${event.id}/webhooks`)
        .set(authHeader(organizer.token))
        .send({
          url: `http://127.0.0.1:${port}/webhook-test`,
          events: ["ping"],
        });
      const webhookId = webhookRes.body.webhook.id;

      await request(app)
        .post(`/api/webhooks/${webhookId}/test`)
        .set(authHeader(organizer.token));
      await processPendingDeliveries();

      const listDelivRes = await request(app)
        .get(`/api/webhooks/${webhookId}/deliveries`)
        .set(authHeader(organizer.token));
      const deliveryId = listDelivRes.body.deliveries[0].id;

      // Redeliver
      const redeliverRes = await request(app)
        .post(`/api/webhook-deliveries/${deliveryId}/redeliver`)
        .set(authHeader(organizer.token));
      expect(redeliverRes.status).toBe(200);
      expect(redeliverRes.body.delivery.status).toBe("succeeded");

      await processPendingDeliveries();

      expect(receivedRequests).toHaveLength(2);
    });
  });
});
