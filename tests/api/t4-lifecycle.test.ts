import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { PlatformRole } from "@prisma/client";
import {
  authHeader,
  clearFixedClock,
  createUser,
  getTestApp,
  resetDatabase,
  setFixedClock,
} from "../helpers/index.js";

describe("Tier 4 Full Lifecycle Integration Test", () => {
  const app = getTestApp();

  beforeEach(async () => {
    await resetDatabase();
    clearFixedClock();
    setFixedClock("2026-06-10T12:00:00.000Z");
  });

  afterEach(() => {
    clearFixedClock();
  });

  it("runs the complete Tier 4 end-to-end flow", async () => {
    const organizer = await createUser({
      email: "t4-organizer@test.local",
      name: "T4 Organizer",
      platformRole: PlatformRole.ORGANIZER,
    });

    // 1. Create event
    const eventRes = await request(app)
      .post("/api/events")
      .set(authHeader(organizer.token))
      .send({
        name: "Tier 4 Hackathon",
        description: "Testing Tier 4 Features",
        submissionsOpen: "2026-06-01T00:00:00.000Z",
        submissionsClose: "2026-06-20T00:00:00.000Z",
        maxTeamSize: 4,
        reviewsPerProject: 1,
        tracks: [{ name: "Web & API", description: "Integration track" }],
        prizes: [{ name: "Grand Prize", description: "Top project", value: "$1000" }],
      })
      .expect(201);

    const eventId = eventRes.body.event.id as string;
    const trackId = eventRes.body.event.tracks[0].id as string;

    // Publish event
    await request(app)
      .post(`/api/events/${eventId}/publish`)
      .set(authHeader(organizer.token))
      .expect(200);

    // 2. Create API Key
    const apiKeyRes = await request(app)
      .post(`/api/events/${eventId}/api-keys`)
      .set(authHeader(organizer.token))
      .send({ name: "E2E Integration Key", scopes: ["read", "write"] })
      .expect(201);

    expect(apiKeyRes.body.key).toBeDefined();
    const rawApiKey = apiKeyRes.body.key;

    // 3. Authenticate with API Key on protected route
    const meRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set("Authorization", `Bearer ${rawApiKey}`)
      .expect(200);

    expect(meRes.body.event.id).toBe(eventId);

    // 4. Create Webhook
    const webhookRes = await request(app)
      .post(`/api/events/${eventId}/webhooks`)
      .set(authHeader(organizer.token))
      .send({
        url: "https://example.com/webhook-receiver",
        events: ["project.submitted", "record.issued"],
      })
      .expect(201);

    expect(webhookRes.body.webhook.id).toBeDefined();

    // List webhooks
    const webhooksListRes = await request(app)
      .get(`/api/events/${eventId}/webhooks`)
      .set(authHeader(organizer.token))
      .expect(200);

    expect(webhooksListRes.body.webhooks.length).toBeGreaterThanOrEqual(1);

    // 5. Test OpenAPI Docs endpoint
    const openapiRes = await request(app).get("/api/openapi.json").expect(200);
    expect(openapiRes.body.openapi).toBe("3.1.0");

    // 6. Test Event Export & Import
    const exportRes = await request(app)
      .get(`/api/events/${eventId}/export.json`)
      .set(authHeader(organizer.token))
      .expect(200);

    expect(exportRes.body.event.id).toBe(eventId);

    // Dry-run import
    const dryRunRes = await request(app)
      .post("/api/import?dryRun=true")
      .set(authHeader(organizer.token))
      .send(exportRes.body)
      .expect(200);

    expect(dryRunRes.body.dryRun).toBe(true);
    expect(dryRunRes.body.summary).toBeDefined();

    // 7. Create participant & project, then issue certificates
    const alice = await createUser({ email: "alice@t4.test", name: "Alice Participant" });
    const teamRes = await request(app)
      .post(`/api/events/${eventId}/teams`)
      .set(authHeader(alice.token))
      .send({ name: "T4 Team" })
      .expect(201);

    const projectRes = await request(app)
      .post("/api/projects")
      .set(authHeader(alice.token))
      .send({
        eventId,
        title: "T4 Project",
        summary: "A project for testing T4 certificates",
        repoUrl: "https://example.com/repo",
        trackId,
      })
      .expect(201);

    await request(app)
      .post(`/api/projects/${projectRes.body.project.id}/submit`)
      .set(authHeader(alice.token))
      .expect(200);

    // Issue Certificates
    const issueRes = await request(app)
      .post(`/api/events/${eventId}/certificates/issue`)
      .set(authHeader(organizer.token))
      .expect(200);

    expect(issueRes.body.issuedCount).toBeGreaterThanOrEqual(1);

    const certsRes = await request(app)
      .get(`/api/events/${eventId}/certificates`)
      .set(authHeader(organizer.token))
      .expect(200);

    expect(certsRes.body.certificates.length).toBeGreaterThanOrEqual(1);
    const sampleCert = certsRes.body.certificates[0];

    // Verify certificate signature
    const verifyRes = await request(app)
      .post("/api/records/verify")
      .send({
        payload: sampleCert.payload,
        signature: sampleCert.signature,
        kid: sampleCert.kid,
      })
      .expect(200);

    expect(verifyRes.body.valid).toBe(true);

    // Fetch public record endpoint
    const pubRecordRes = await request(app)
      .get(`/api/records/${sampleCert.id}`)
      .expect(200);

    expect(pubRecordRes.body.record.id).toBe(sampleCert.id);

    // 8. Test Embed Gallery API
    const embedRes = await request(app)
      .get(`/api/embed/gallery?eventId=${eventId}`)
      .expect(200);

    expect(Array.isArray(embedRes.body.projects)).toBe(true);
  });
});
