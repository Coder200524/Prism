import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../../src/server/src/lib/prisma.js";
import { getTestApp, resetDatabase, seedPermissionScenario, type Scenario } from "../helpers/index.js";

describe("api/community/comments", () => {
  const app = getTestApp();
  let sc: Scenario;

  beforeEach(async () => {
    await resetDatabase();
    sc = await seedPermissionScenario();
  });

  it("public list works and hides hidden comments", async () => {
    // create two comments
    const c1 = await prisma.comment.create({
      data: { projectId: sc.projectId, eventId: sc.eventId, authorId: sc.participant.id, body: "Visible comment" }
    });
    const c2 = await prisma.comment.create({
      data: { projectId: sc.projectId, eventId: sc.eventId, authorId: sc.participant.id, body: "Hidden comment", hiddenAt: new Date() }
    });

    const res = await request(app).get(`/api/projects/${sc.projectId}/comments`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(c1.id);
  });

  it("anonymous post -> 401", async () => {
    const res = await request(app)
      .post(`/api/projects/${sc.projectId}/comments`)
      .send({ body: "Test comment" });
    expect(res.status).toBe(401);
  });

  it("empty or too-long body -> 400", async () => {
    let res = await request(app)
      .post(`/api/projects/${sc.projectId}/comments`)
      .set("Authorization", `Bearer ${sc.participant.token}`)
      .send({ body: "   " });
    expect(res.status).toBe(400);

    res = await request(app)
      .post(`/api/projects/${sc.projectId}/comments`)
      .set("Authorization", `Bearer ${sc.participant.token}`)
      .send({ body: "a".repeat(2001) });
    expect(res.status).toBe(400);
  });

  it("HTML is stored and returned as plain text, not interpreted", async () => {
    const res = await request(app)
      .post(`/api/projects/${sc.projectId}/comments`)
      .set("Authorization", `Bearer ${sc.participant.token}`)
      .send({ body: "<script>alert(1)</script>" });
    expect(res.status).toBe(201);

    const getRes = await request(app).get(`/api/projects/${sc.projectId}/comments`);
    expect(getRes.status).toBe(200);
    expect(getRes.body[0].body).toBe("<script>alert(1)</script>");
  });

  it("duplicate within 10 min -> 409", async () => {
    await request(app)
      .post(`/api/projects/${sc.projectId}/comments`)
      .set("Authorization", `Bearer ${sc.participant.token}`)
      .send({ body: "Duplicate comment" });

    const res = await request(app)
      .post(`/api/projects/${sc.projectId}/comments`)
      .set("Authorization", `Bearer ${sc.participant.token}`)
      .send({ body: "  duplicate   COMMENT  " });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("duplicate_comment");
  });

  it("rate limit -> 429", async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post(`/api/projects/${sc.projectId}/comments`)
        .set("Authorization", `Bearer ${sc.participant.token}`)
        .send({ body: `Comment ${i}` });
    }

    const res = await request(app)
      .post(`/api/projects/${sc.projectId}/comments`)
      .set("Authorization", `Bearer ${sc.participant.token}`)
      .send({ body: "One too many" });
    expect(res.status).toBe(429);
  });

  it("author can delete own", async () => {
    const c = await prisma.comment.create({
      data: { projectId: sc.projectId, eventId: sc.eventId, authorId: sc.participant.id, body: "To be deleted" }
    });

    const res = await request(app)
      .delete(`/api/comments/${c.id}`)
      .set("Authorization", `Bearer ${sc.participant.token}`);
    expect(res.status).toBe(200);

    const deleted = await prisma.comment.findUnique({ where: { id: c.id } });
    expect(deleted?.hiddenAt).not.toBeNull();
    expect(deleted?.hiddenReason).toBe("deleted by author");
  });

  it("another participant cannot delete -> 403", async () => {
    const c = await prisma.comment.create({
      data: { projectId: sc.projectId, eventId: sc.eventId, authorId: sc.participant.id, body: "To be deleted" }
    });

    const res = await request(app)
      .delete(`/api/comments/${c.id}`)
      .set("Authorization", `Bearer ${sc.outsider.token}`);
    expect(res.status).toBe(403);
  });

  it("judge cannot hide -> 403", async () => {
    const c = await prisma.comment.create({
      data: { projectId: sc.projectId, eventId: sc.eventId, authorId: sc.participant.id, body: "To be hidden" }
    });

    const res = await request(app)
      .post(`/api/comments/${c.id}/hide`)
      .set("Authorization", `Bearer ${sc.judgeA.token}`)
      .send({ reason: "spam" });
    expect(res.status).toBe(403);
  });

  it("organizer hide and unhide work and are audited", async () => {
    const c = await prisma.comment.create({
      data: { projectId: sc.projectId, eventId: sc.eventId, authorId: sc.participant.id, body: "To be hidden" }
    });

    let res = await request(app)
      .post(`/api/comments/${c.id}/hide`)
      .set("Authorization", `Bearer ${sc.organizer.token}`)
      .send({ reason: "spam" });
    expect(res.status).toBe(200);

    let hidden = await prisma.comment.findUnique({ where: { id: c.id } });
    expect(hidden?.hiddenAt).not.toBeNull();
    expect(hidden?.hiddenReason).toBe("spam");

    res = await request(app)
      .post(`/api/comments/${c.id}/unhide`)
      .set("Authorization", `Bearer ${sc.organizer.token}`);
    expect(res.status).toBe(200);

    hidden = await prisma.comment.findUnique({ where: { id: c.id } });
    expect(hidden?.hiddenAt).toBeNull();
    expect(hidden?.hiddenReason).toBe("");

    const logs = await prisma.auditLog.findMany({ where: { targetId: c.id } });
    expect(logs.some(l => l.action === "comment.hide")).toBe(true);
    expect(logs.some(l => l.action === "comment.unhide")).toBe(true);
  });

  it("comments on draft projects -> 404", async () => {
    const res = await request(app)
      .get(`/api/projects/${sc.draftProjectId}/comments`);
    expect(res.status).toBe(404);

    const res2 = await request(app)
      .post(`/api/projects/${sc.draftProjectId}/comments`)
      .set("Authorization", `Bearer ${sc.participant.token}`)
      .send({ body: "Hello" });
    expect(res2.status).toBe(404);
  });
});
