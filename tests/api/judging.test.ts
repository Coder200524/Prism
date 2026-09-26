import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { getTestApp, resetDatabase, createUser } from "../helpers/index.js";
import { PlatformRole, AssignmentStatus } from "@prisma/client";
import { prisma } from "../../src/server/src/lib/prisma.js";

describe("api/judging", () => {
  const app = getTestApp();

  beforeEach(async () => {
    await resetDatabase();
  });

  it("does not wipe comment on draft save and logs edit_after_submit", async () => {
    const admin = await createUser({ email: "admin@test.com", name: "Admin", platformRole: PlatformRole.ADMIN });
    const judge = await createUser({ email: "judge@test.com", name: "Judge" });
    const participant = await createUser({ email: "part@test.com", name: "Participant" });
    
    // Create event and project
    const event = await request(app)
      .post("/api/events")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        name: "Test Event",
        submissionsOpen: "2026-06-01T00:00:00.000Z",
        submissionsClose: "2030-06-20T00:00:00.000Z",
        judgingOpen: "2026-06-01T00:00:00.000Z",
        judgingClose: "2030-06-20T00:00:00.000Z",
        maxTeamSize: 4,
        reviewsPerProject: 2,
        tracks: [{ name: "General Track", description: "All projects" }],
        prizes: [],
        criteria: [{ name: "Design", key: "design", minScore: 1, maxScore: 10, weight: 1 }],
      });
      
    const eventId = event.body.event.id;
    
    // Create criteria
    await request(app).put(`/api/events/${eventId}/criteria`).set("Authorization", `Bearer ${admin.token}`).send({
      criteria: [{ name: "Design", key: "design", minScore: 1, maxScore: 10, weight: 100 }],
    });

    await prisma.event.update({ where: { id: eventId }, data: { publishedAt: new Date() } });
    await prisma.eventRole.create({ data: { eventId, userId: judge.id, role: "JUDGE" } });

    // Create team
    await request(app)
      .post(`/api/events/${eventId}/teams`)
      .set("Authorization", `Bearer ${participant.token}`)
      .send({ name: "Admin Team" });

    const projectRes = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${participant.token}`)
      .send({
        eventId,
        title: "Test Project",
        summary: "A good summary",
        repoUrl: "https://github.com/foo/bar",
      });
    const projectId = projectRes.body.project.id;
    await request(app)
      .post(`/api/projects/${projectId}/submit`)
      .set("Authorization", `Bearer ${participant.token}`)
      .send({
        trackId: event.body.event.tracks[0].id,
      });

    // Assign judge
    const assignRes = await request(app)
      .post(`/api/events/${eventId}/assignments`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ judgeId: judge.id, projectId });
    const assignmentId = assignRes.body.assignment.id;

    // Open judging by moving submissionsClose to the past
    await request(app).patch(`/api/events/${eventId}`).set("Authorization", `Bearer ${admin.token}`).send({
      submissionsOpen: "2019-01-01T00:00:00.000Z",
      submissionsClose: "2020-01-01T00:00:00.000Z",
      judgingClose: "2030-06-20T00:00:00.000Z",
    });

    // 1. Judge submits scores and a comment
    await request(app)
      .put(`/api/judge/assignments/${assignmentId}/scores`)
      .set("Authorization", `Bearer ${judge.token}`)
      .send({
        scores: { design: 8 },
        comment: "Great design",
        submit: true,
      });

    let assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
    expect(assignment?.comment).toBe("Great design");
    expect(assignment?.status).toBe(AssignmentStatus.SUBMITTED);

    // 2. Judge saves a draft (e.g. changing score only, omitting comment)
    await request(app)
      .put(`/api/judge/assignments/${assignmentId}/scores`)
      .set("Authorization", `Bearer ${judge.token}`)
      .send({
        scores: { design: 9 },
        // comment omitted
        submit: false,
      });

    assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
    expect(assignment?.comment).toBe("Great design"); // Should not be wiped

    // Check audit logs
    const audits = await prisma.auditLog.findMany({
      where: { eventId },
      orderBy: { at: 'desc' }
    });
    const editLog = audits.find(a => a.action === "score.edit_after_submit");
    expect(editLog).toBeDefined();
  });

  it("rejects duplicate rubric keys", async () => {
    const admin = await createUser({ email: "admin2@test.com", name: "Admin2", platformRole: PlatformRole.ADMIN });
    const event = await request(app)
      .post("/api/events")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        name: "Test Event 2",
        submissionsOpen: "2026-06-01T00:00:00.000Z",
        submissionsClose: "2030-06-20T00:00:00.000Z",
        maxTeamSize: 4,
        reviewsPerProject: 2,
        tracks: [],
        prizes: [],
        criteria: [{ name: "Design", key: "design", minScore: 1, maxScore: 10, weight: 100 }],
      });
    const eventId = event.body.event.id;

    const res = await request(app)
      .put(`/api/events/${eventId}/criteria`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        criteria: [
          { name: "Design 1", key: "design", minScore: 1, maxScore: 10, weight: 50 },
          { name: "Design 2", key: "design", minScore: 1, maxScore: 10, weight: 50 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/unique/i);
  });

  it("handles peer score audit logging properly (404 on unknown event, real eventId)", async () => {
    const user = await createUser({ email: "snoop@test.com", name: "Snoop" });
    const judge = await createUser({ email: "judge9@test.com", name: "Judge9" });
    const admin = await createUser({ email: "admin9@test.com", name: "Admin9", platformRole: PlatformRole.ADMIN });

    const event = await request(app)
      .post("/api/events")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        name: "Test Event 9",
        submissionsOpen: "2026-06-01T00:00:00.000Z",
        submissionsClose: "2030-06-20T00:00:00.000Z",
        maxTeamSize: 4,
        reviewsPerProject: 2,
        tracks: [],
        prizes: [],
        criteria: [{ name: "Design", key: "design", minScore: 1, maxScore: 10, weight: 100 }],
      });
    const eventId = event.body.event.id;

    // Make judge a judge in this event
    await prisma.eventRole.create({
      data: {
        eventId,
        userId: judge.id,
        role: "JUDGE",
      }
    });

    // 1. Unknown event -> 404
    const unknownRes = await request(app)
      .get(`/api/judge/scores?judge=${judge.id}&eventId=nonexistent_event`)
      .set("Authorization", `Bearer ${user.token}`);
    expect(unknownRes.status).toBe(404);

    // 2. No eventId provided -> denied access across all events, attaches real eventId to audit
    const noEventRes = await request(app)
      .get(`/api/judge/scores?judge=${judge.id}`)
      .set("Authorization", `Bearer ${user.token}`);
    expect(noEventRes.status).toBe(403);

    const audits = await prisma.auditLog.findMany({
      where: { action: "access.denied_peer_scores", targetId: judge.id },
    });
    expect(audits.some(a => a.eventId === eventId)).toBe(true);
  });
});
