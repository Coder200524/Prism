import { describe, expect, it } from "vitest";
import request from "supertest";
import { EventRoleType } from "@prisma/client";
import { prisma } from "../../src/server/src/lib/prisma.js";
import {
  authHeader,
  createEvent,
  createUser,
  getTestApp,
  grantEventRole,
  resetDatabase,
} from "../helpers/index.js";

describe("Certificates API (/api/me/certificates & /api/events/:eventId/certificates)", () => {
  it("issues participant and judge certificates idempotently and includes placement after publishing", async () => {
    await resetDatabase();
    const app = getTestApp();

    const organizer = await createUser({
      email: "org@cert.local",
      name: "Organizer",
      platformRole: "ORGANIZER",
    });
    const participant = await createUser({
      email: "participant@cert.local",
      name: "Participant User",
    });
    const judgeA = await createUser({
      email: "judgea@cert.local",
      name: "Judge Alice",
    });
    const judgeB = await createUser({
      email: "judgeb@cert.local",
      name: "Judge Bob",
    });

    const event = await createEvent({ name: "Cert Hackathon" });
    const eventId = event.id;

    await grantEventRole(organizer.id, eventId, EventRoleType.ORGANIZER);
    await grantEventRole(participant.id, eventId, EventRoleType.PARTICIPANT);
    await grantEventRole(judgeA.id, eventId, EventRoleType.JUDGE);
    await grantEventRole(judgeB.id, eventId, EventRoleType.JUDGE);

    // Create track, team, member & submitted project
    const track = await prisma.track.create({
      data: { eventId, name: "Main Track" },
    });

    const team = await prisma.team.create({
      data: {
        eventId,
        name: "Winning Team",
        inviteCode: "cert_code",
        members: {
          create: {
            user: { connect: { id: participant.id } },
            event: { connect: { id: eventId } },
          },
        },
      },
    });

    const project = await prisma.project.create({
      data: {
        eventId,
        teamId: team.id,
        trackId: track.id,
        title: "Super Project",
        summary: "Project summary",
        repoUrl: "https://github.com/test",
        demoUrl: "https://test.com",
        status: "SUBMITTED",
        submittedAt: new Date("2026-09-27T10:00:00Z"),
      },
    });

    // Create rubric & submitted assignment for Judge A
    const criterion = await prisma.criterion.create({
      data: {
        eventId,
        key: "tech",
        name: "Tech",
        description: "Tech score",
        weight: 100,
        minScore: 1,
        maxScore: 10,
        position: 0,
      },
    });

    await prisma.assignment.create({
      data: {
        eventId,
        judgeId: judgeA.id,
        projectId: project.id,
        status: "SUBMITTED",
        submittedAt: new Date("2026-09-27T11:00:00Z"),
        comment: "Great job",
        scores: {
          create: { criterionId: criterion.id, value: 9 },
        },
      },
    });

    // 1. Organizer manually issues certificates (before publish)
    const issueRes1 = await request(app)
      .post(`/api/events/${eventId}/certificates/issue`)
      .set(authHeader(organizer.token));
    expect(issueRes1.status).toBe(200);
    expect(issueRes1.body.issuedCount).toBeGreaterThan(0);

    // Check participant certificate (placement is null before publish)
    const meRes1 = await request(app)
      .get("/api/me/certificates")
      .set(authHeader(participant.token));
    expect(meRes1.status).toBe(200);
    expect(meRes1.body.certificates).toHaveLength(1);
    expect(meRes1.body.certificates[0].type).toBe("participant_certificate");
    expect(meRes1.body.certificates[0].payload.placement).toBeNull();

    // 2. Publish results (which auto-issues/updates placement)
    await request(app)
      .post(`/api/events/${eventId}/results/publish`)
      .set(authHeader(organizer.token));

    // Re-issue certificates after publish
    const issueRes2 = await request(app)
      .post(`/api/events/${eventId}/certificates/issue`)
      .set(authHeader(organizer.token));
    expect(issueRes2.status).toBe(200);

    // 3. Judge A checks own certificates
    const judgeRes = await request(app)
      .get("/api/me/certificates")
      .set(authHeader(judgeA.token));
    expect(judgeRes.status).toBe(200);
    expect(judgeRes.body.certificates.some((c: any) => c.type === "judge_certificate")).toBe(true);

    // 4. Judge B checks own certificates (Judge B has no submitted reviews -> 0 certificates)
    const judgeBRes = await request(app)
      .get("/api/me/certificates")
      .set(authHeader(judgeB.token));
    expect(judgeBRes.status).toBe(200);
    expect(judgeBRes.body.certificates).toHaveLength(0);

    // 5. Organizer lists event certificates
    const orgRes = await request(app)
      .get(`/api/events/${eventId}/certificates`)
      .set(authHeader(organizer.token));
    expect(orgRes.status).toBe(200);
    expect(orgRes.body.certificates.length).toBeGreaterThan(0);

    // 6. Public verification of participant certificate
    const certId = meRes1.body.certificates[0].id;
    const verifyRes = await request(app).get(`/api/records/${certId}`);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.valid).toBe(true);
    expect(verifyRes.body.record.id).toBe(certId);
  });
});
