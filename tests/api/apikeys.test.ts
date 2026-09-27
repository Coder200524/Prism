import { describe, expect, it, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { PlatformRole, EventRoleType } from "@prisma/client";
import {
  authHeader,
  clearFixedClock,
  createEvent,
  createUser,
  getTestApp,
  grantEventRole,
  resetDatabase,
} from "../helpers/index.js";

describe("API Keys API (/api/events/:eventId/api-keys & /api/api-keys)", () => {
  const app = getTestApp();

  beforeEach(async () => {
    await resetDatabase();
    clearFixedClock();
  });

  afterEach(() => {
    clearFixedClock();
  });

  it("allows an event organizer to create, list, and revoke API keys", async () => {
    const organizer = await createUser({
      email: "org@test.local",
      name: "Organizer",
      platformRole: PlatformRole.ORGANIZER,
    });
    const event = await createEvent({ name: "API Key Event" });
    await grantEventRole(organizer.id, event.id, EventRoleType.ORGANIZER);

    // 1. Create API key with read scope
    const createRes = await request(app)
      .post(`/api/events/${event.id}/api-keys`)
      .set(authHeader(organizer.token))
      .send({
        name: "Test Read Key",
        scopes: ["read"],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();
    expect(createRes.body.key).toMatch(/^dfk_[A-Za-z0-9_-]+/);
    expect(createRes.body.prefix).toBe(createRes.body.key.slice(0, 8));
    expect(createRes.body.scopes).toEqual(["read"]);

    const readKey = createRes.body.key;

    // 2. List API keys
    const listRes = await request(app)
      .get(`/api/events/${event.id}/api-keys`)
      .set(authHeader(organizer.token));

    expect(listRes.status).toBe(200);
    expect(listRes.body.apiKeys).toHaveLength(1);
    expect(listRes.body.apiKeys[0].id).toBe(createRes.body.id);
    expect(listRes.body.apiKeys[0].keyHash).toBeUndefined();
    expect(listRes.body.apiKeys[0].key).toBeUndefined();

    // 3. Use readKey for GET request
    const getRes = await request(app)
      .get(`/api/events/${event.id}`)
      .set(authHeader(readKey));

    expect(getRes.status).toBe(200);
    expect(getRes.body.event.id).toBe(event.id);

    // 4. Use readKey for POST request -> 403 insufficient scope
    const postRes = await request(app)
      .post(`/api/events/${event.id}/tracks`)
      .set(authHeader(readKey))
      .send({ name: "New Track" });

    expect(postRes.status).toBe(403);
    expect(postRes.body.error.code).toBe("insufficient_scope");

    // 5. Create a write API key
    const writeCreateRes = await request(app)
      .post(`/api/events/${event.id}/api-keys`)
      .set(authHeader(organizer.token))
      .send({
        name: "Test Write Key",
        scopes: ["read", "write"],
      });

    expect(writeCreateRes.status).toBe(201);
    const writeKey = writeCreateRes.body.key;

    // 6. Use writeKey to POST track -> success 201
    const postTrackRes = await request(app)
      .post(`/api/events/${event.id}/tracks`)
      .set(authHeader(writeKey))
      .send({ name: "New Track" });

    expect(postTrackRes.status).toBe(201);

    // 7. Revoke readKey
    const revokeRes = await request(app)
      .delete(`/api/api-keys/${createRes.body.id}`)
      .set(authHeader(organizer.token));

    expect(revokeRes.status).toBe(200);

    // 8. Try using revoked key on protected endpoint -> 401
    const getRevokedRes = await request(app)
      .get(`/api/events/${event.id}/api-keys`)
      .set(authHeader(readKey));

    expect(getRevokedRes.status).toBe(401);
  });

  it("enforces eventId matching for scoped API keys", async () => {
    const organizer = await createUser({
      email: "org2@test.local",
      name: "Organizer 2",
      platformRole: PlatformRole.ORGANIZER,
    });
    const event1 = await createEvent({ name: "Event 1" });
    const event2 = await createEvent({ name: "Event 2" });
    await grantEventRole(organizer.id, event1.id, EventRoleType.ORGANIZER);

    const createRes = await request(app)
      .post(`/api/events/${event1.id}/api-keys`)
      .set(authHeader(organizer.token))
      .send({
        name: "Event 1 Key",
        scopes: ["read"],
      });

    const apiKey = createRes.body.key;

    // Access event1 -> 200
    const res1 = await request(app)
      .get(`/api/events/${event1.id}`)
      .set(authHeader(apiKey));
    expect(res1.status).toBe(200);

    // Access event2 -> 403 event mismatch
    const res2 = await request(app)
      .get(`/api/events/${event2.id}`)
      .set(authHeader(apiKey));
    expect(res2.status).toBe(403);
    expect(res2.body.error.code).toBe("event_mismatch");
  });
});
