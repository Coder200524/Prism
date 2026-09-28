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
import { prisma } from "../../src/server/src/lib/prisma.js";
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

    // Access event2 -> 403 api_key_scope
    const res2 = await request(app)
      .get(`/api/events/${event2.id}`)
      .set(authHeader(apiKey));
    expect(res2.status).toBe(403);
    expect(res2.body.error.code).toBe("api_key_scope");
  });

  it("blocks event-scoped keys from indirect Event B resources by id", async () => {
    const organizer = await createUser({
      email: "scope_org@test.local",
      name: "Scope Org",
      platformRole: PlatformRole.ORGANIZER,
    });
    const eventA = await createEvent({ name: "Scoped A" });
    const eventB = await createEvent({ name: "Scoped B" });
    await grantEventRole(organizer.id, eventA.id, EventRoleType.ORGANIZER);
    await grantEventRole(organizer.id, eventB.id, EventRoleType.ORGANIZER);

    const teamB = await prisma.team.create({
      data: { eventId: eventB.id, name: "Team B", inviteCode: "scope_b" },
    });
    const projectB = await prisma.project.create({
      data: {
        eventId: eventB.id,
        teamId: teamB.id,
        title: "Project B",
        summary: "B",
        repoUrl: "https://example.com/b",
        demoUrl: "",
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });
    const webhookB = await prisma.webhook.create({
      data: {
        eventId: eventB.id,
        url: "https://8.8.8.8/hook",
        secret: "encrypted-placeholder",
        events: ["ping"],
        createdById: organizer.id,
      },
    });

    const createRes = await request(app)
      .post(`/api/events/${eventA.id}/api-keys`)
      .set(authHeader(organizer.token))
      .send({ name: "A-only", scopes: ["read", "write"] });
    expect(createRes.status).toBe(201);
    const keyA = createRes.body.key as string;

    const okA = await request(app)
      .get(`/api/events/${eventA.id}`)
      .set(authHeader(keyA));
    expect(okA.status).toBe(200);

    const projectDenied = await request(app)
      .get(`/api/projects/${projectB.id}`)
      .set(authHeader(keyA));
    expect(projectDenied.status).toBe(403);
    expect(projectDenied.body.error.code).toBe("api_key_scope");

    const webhookDenied = await request(app)
      .get(`/api/webhooks/${webhookB.id}`)
      .set(authHeader(keyA));
    expect(webhookDenied.status).toBe(403);
    expect(webhookDenied.body.error.code).toBe("api_key_scope");

    // Session auth still works for the same organizer on event B.
    const sessionOk = await request(app)
      .get(`/api/projects/${projectB.id}`)
      .set(authHeader(organizer.token));
    expect(sessionOk.status).toBe(200);
  });

    // (Deleted test: "blocks event-scoped keys from revoking another event's API key" because API keys cannot call API key management routes at all anymore)

  it("strictly enforces scoped and unscoped API keys access across various endpoints", async () => {
    const admin = await createUser({
      email: "admin_scope@test.local",
      name: "Admin Scope",
      platformRole: PlatformRole.ADMIN,
    });
    const organizer = await createUser({
      email: "strict_org@test.local",
      name: "Strict Org",
      platformRole: PlatformRole.ORGANIZER,
    });
    const eventA = await createEvent({ id: "evt_a_strict", name: "Event A" });
    const eventB = await createEvent({ id: "evt_b_strict", name: "Event B" });
    await grantEventRole(organizer.id, eventA.id, EventRoleType.ORGANIZER);
    await grantEventRole(organizer.id, eventB.id, EventRoleType.ORGANIZER);

    const trackB = await prisma.track.create({
      data: { eventId: eventB.id, name: "Track B" },
    });

    const teamB = await prisma.team.create({
      data: { eventId: eventB.id, name: "Team Strict B", inviteCode: "strict_b" }
    });
    const projectB = await prisma.project.create({
      data: { eventId: eventB.id, teamId: teamB.id, title: "Proj", summary: "summary", repoUrl: "https://a.com", status: "SUBMITTED", submittedAt: new Date() }
    });
    
    const voteB = await prisma.vote.create({
      data: { eventId: eventB.id, projectId: projectB.id, trackId: trackB.id, voterId: organizer.id, ipHash: "hash", userAgentHash: "ua" },
    });
    
    const commentB = await prisma.comment.create({
      data: { eventId: eventB.id, projectId: projectB.id, authorId: organizer.id, body: "Comment" },
    });

    const keyARes = await request(app)
      .post(`/api/events/${eventA.id}/api-keys`)
      .set(authHeader(organizer.token))
      .send({ name: "Key A", scopes: ["read", "write"] });
    const keyA = keyARes.body.key as string;

    const unscopedRow = await prisma.apiKey.create({
      data: {
        ownerId: organizer.id,
        name: "Unscoped Key",
        prefix: "dfk_unsc",
        keyHash: "8cfed89045eb069f4b63790482d4b683bc287f29da231a45e95840a0d4696e63",
        scopes: ["read", "write"],
      }
    });
    const keyUnscoped = "dfk_unsc_dummy";

    const adminUnscopedRow = await prisma.apiKey.create({
      data: {
        ownerId: admin.id,
        name: "Admin Unscoped",
        prefix: "dfk_admi",
        keyHash: "20031464e2301dd016299869aa3989b6cc29997db5c9ae861d95d4a90628b2f8",
        scopes: ["read", "write"],
      }
    });
    const adminKey = "dfk_admin_dummy";

    // A's endpoints still work for Key A
    const okA = await request(app).get(`/api/events/${eventA.id}`).set(authHeader(keyA));
    expect(okA.status).toBe(200);

    // B's judge scores -> 403
    const judgeScoresB = await request(app).get(`/api/judge/scores?eventId=${eventB.id}`).set(authHeader(keyA));
    expect(judgeScoresB.status).toBe(403);

    // void a vote in B -> 403
    const voidVoteB = await request(app).post(`/api/votes/${voteB.id}/void`).set(authHeader(keyA)).send({ reason: "spam" });
    expect(voidVoteB.status).toBe(403);

    // hide a comment in B -> 403
    const hideCommentB = await request(app).post(`/api/comments/${commentB.id}/hide`).set(authHeader(keyA));
    expect(hideCommentB.status).toBe(403);

    // POST /api/events -> 403
    const postEvents = await request(app).post(`/api/events`).set(authHeader(keyA)).send({ name: "Event C" });
    expect(postEvents.status).toBe(403);

    // /api/admin/users with an admin-owned key -> 403
    const adminUsers = await request(app).get(`/api/admin/users`).set(authHeader(adminKey));
    expect(adminUsers.status).toBe(403);

    // /api/import -> 403
    const importRes = await request(app).post(`/api/import?dryRun=true`).set(authHeader(keyA)).send({});
    expect(importRes.status).toBe(403);

    // unscoped key -> only events the owner organizes (works for A)
    const unscopedA = await request(app).get(`/api/events/${eventA.id}`).set(authHeader(keyUnscoped));
    expect(unscopedA.status).toBe(200);

    // unscoped key fails for unorganized event
    const eventUnorg = await createEvent({ id: "evt_unorg_strict", name: "Unorganized" });
    const unscopedFail = await request(app).get(`/api/events/${eventUnorg.id}`).set(authHeader(keyUnscoped));
    expect(unscopedFail.status).toBe(403);
  });
});
