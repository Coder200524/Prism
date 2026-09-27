import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlatformRole, EventRoleType, AssignmentStatus, ProjectStatus } from "@prisma/client";
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

function runVerifyScript(
  recordFile: string,
  keysFile: string,
): { exitCode: number; stdout: string } {
  try {
    const stdout = execFileSync(
      "node",
      ["tools/verify-record.mjs", recordFile, keysFile],
      { encoding: "utf8" },
    );
    return { exitCode: 0, stdout };
  } catch (err: any) {
    return {
      exitCode: err.status ?? 1,
      stdout: (err.stdout ?? "") + (err.stderr ?? ""),
    };
  }
}

describe("Verifiable Judge Records API & Offline Verification", () => {
  const app = getTestApp();
  let organizer: any;
  let judge: any;
  let participant: any;
  let event: any;

  beforeEach(async () => {
    await resetDatabase();
    clearFixedClock();

    organizer = await createUser({
      email: "organizer@test.local",
      name: "Event Organizer",
      platformRole: PlatformRole.ORGANIZER,
    });

    judge = await createUser({
      email: "judge@test.local",
      name: "Judge Alpha",
      platformRole: PlatformRole.USER,
    });

    participant = await createUser({
      email: "participant@test.local",
      name: "Participant One",
      platformRole: PlatformRole.USER,
    });

    event = await createEvent({ name: "Verifiable Event" });
    await grantEventRole(organizer.id, event.id, EventRoleType.ORGANIZER);
    await grantEventRole(judge.id, event.id, EventRoleType.JUDGE);
    await grantEventRole(participant.id, event.id, EventRoleType.PARTICIPANT);

    const team = await prisma.team.create({
      data: {
        eventId: event.id,
        name: "Test Team",
        inviteCode: "inv_test_team",
      },
    });

    const project = await prisma.project.create({
      data: {
        eventId: event.id,
        teamId: team.id,
        title: "Test Project",
        status: ProjectStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });

    await prisma.assignment.create({
      data: {
        eventId: event.id,
        judgeId: judge.id,
        projectId: project.id,
        status: AssignmentStatus.SUBMITTED,
        comment: "Great project",
        submittedAt: new Date(),
      },
    });
  });

  afterEach(() => {
    clearFixedClock();
  });

  it("issues judge participation records when results are published", async () => {
    const res = await request(app)
      .post(`/api/events/${event.id}/results/publish`)
      .set(authHeader(organizer.token));

    expect(res.status).toBe(200);

    const records = await prisma.record.findMany({
      where: { eventId: event.id, type: "judge_participation" },
    });

    expect(records.length).toBe(1);

    // Verify isolation: NO scores or comments in payload
    const payload = records[0].payload as Record<string, unknown>;
    expect(payload.id).toBe(records[0].id);
    expect(payload.type).toBe("judge_participation");
    expect(payload.reviewsSubmitted).toBe(1);
    expect(payload).not.toHaveProperty("scores");
    expect(payload).not.toHaveProperty("comments");
    expect(payload).not.toHaveProperty("criterionScores");
  });

  it("is idempotent and does not create duplicate records when re-issued", async () => {
    await request(app)
      .post(`/api/events/${event.id}/results/publish`)
      .set(authHeader(organizer.token));

    const initialCount = await prisma.record.count({
      where: { eventId: event.id, type: "judge_participation" },
    });

    const res = await request(app)
      .post(`/api/events/${event.id}/records/issue`)
      .set(authHeader(organizer.token));

    expect(res.status).toBe(200);

    const newCount = await prisma.record.count({
      where: { eventId: event.id, type: "judge_participation" },
    });

    expect(newCount).toBe(initialCount);
  });

  it("serves record details publicly at GET /api/records/:id", async () => {
    await request(app)
      .post(`/api/events/${event.id}/results/publish`)
      .set(authHeader(organizer.token));

    const record = await prisma.record.findFirst({
      where: { eventId: event.id },
    });

    const res = await request(app).get(`/api/records/${record!.id}`);

    expect(res.status).toBe(200);
    expect(res.body.record.id).toBe(record!.id);
    expect(res.body.valid).toBe(true);
  });

  it("serves JWKS public signing keys at GET /api/records/keys", async () => {
    await request(app)
      .post(`/api/events/${event.id}/results/publish`)
      .set(authHeader(organizer.token));

    const res = await request(app).get("/api/records/keys");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.keys)).toBe(true);
    expect(res.body.keys.length).toBeGreaterThan(0);
    expect(res.body.keys[0]).toHaveProperty("kid");
    expect(res.body.keys[0]).toHaveProperty("publicKey");
  });

  it("verifies record payloads at POST /api/records/verify", async () => {
    await request(app)
      .post(`/api/events/${event.id}/results/publish`)
      .set(authHeader(organizer.token));

    const record = await prisma.record.findFirst({
      where: { eventId: event.id },
    });

    const recordRes = await request(app).get(`/api/records/${record!.id}`);
    const { payload, signature, kid } = recordRes.body.record;

    const verifyRes = await request(app)
      .post("/api/records/verify")
      .send({ payload, signature, kid });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.valid).toBe(true);
  });

  it("lists own records at GET /api/me/records for authenticated user", async () => {
    await request(app)
      .post(`/api/events/${event.id}/results/publish`)
      .set(authHeader(organizer.token));

    const res = await request(app)
      .get("/api/me/records")
      .set(authHeader(judge.token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.records)).toBe(true);
    expect(res.body.records.length).toBe(1);
    expect(res.body.records[0].subjectUserId).toBe(judge.id);
  });

  it("verifies record offline using tools/verify-record.mjs", async () => {
    await request(app)
      .post(`/api/events/${event.id}/results/publish`)
      .set(authHeader(organizer.token));

    const record = await prisma.record.findFirst({
      where: { eventId: event.id },
    });

    const recordRes = await request(app).get(`/api/records/${record!.id}`);
    const keysRes = await request(app).get("/api/records/keys");

    const tmpDir = path.resolve(process.cwd(), "scratch");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const recordFile = path.join(tmpDir, `test_record_${Date.now()}.json`);
    const keysFile = path.join(tmpDir, `test_keys_${Date.now()}.json`);

    fs.writeFileSync(recordFile, JSON.stringify(recordRes.body));
    fs.writeFileSync(keysFile, JSON.stringify(keysRes.body));

    try {
      const { stdout, exitCode } = runVerifyScript(recordFile, keysFile);

      expect(exitCode).toBe(0);
      expect(stdout.trim()).toBe("VALID");

      // Test tampering: modify 1 character in payload
      const tamperedRecord = JSON.parse(JSON.stringify(recordRes.body));
      tamperedRecord.record.payload.reviewsSubmitted = 9999;
      fs.writeFileSync(recordFile, JSON.stringify(tamperedRecord));

      const tamperedResult = runVerifyScript(recordFile, keysFile);

      expect(tamperedResult.exitCode).toBe(1);
      expect(tamperedResult.stdout).toContain("INVALID");
    } finally {
      if (fs.existsSync(recordFile)) fs.unlinkSync(recordFile);
      if (fs.existsSync(keysFile)) fs.unlinkSync(keysFile);
    }
  });

  it("allows organizer to revoke record and reports it as revoked", async () => {
    await request(app)
      .post(`/api/events/${event.id}/results/publish`)
      .set(authHeader(organizer.token));

    const record = await prisma.record.findFirst({
      where: { eventId: event.id },
    });

    const revokeRes = await request(app)
      .post(`/api/records/${record!.id}/revoke`)
      .set(authHeader(organizer.token))
      .send({ reason: "Duplicate review count adjustment" });

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.revokedReason).toBe(
      "Duplicate review count adjustment",
    );

    const checkRes = await request(app).get(`/api/records/${record!.id}`);
    expect(checkRes.body.valid).toBe(false);

    // Verify offline script reports revoked
    const keysRes = await request(app).get("/api/records/keys");

    const tmpDir = path.resolve(process.cwd(), "scratch");
    const recordFile = path.join(tmpDir, `revoked_record_${Date.now()}.json`);
    const keysFile = path.join(tmpDir, `revoked_keys_${Date.now()}.json`);

    fs.writeFileSync(recordFile, JSON.stringify(checkRes.body));
    fs.writeFileSync(keysFile, JSON.stringify(keysRes.body));

    try {
      const result = runVerifyScript(recordFile, keysFile);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("INVALID: Record was revoked");
    } finally {
      if (fs.existsSync(recordFile)) fs.unlinkSync(recordFile);
      if (fs.existsSync(keysFile)) fs.unlinkSync(keysFile);
    }
  });

  it("enforces permission checks on record issue and revoke", async () => {
    await request(app)
      .post(`/api/events/${event.id}/results/publish`)
      .set(authHeader(organizer.token));

    const record = await prisma.record.findFirst({
      where: { eventId: event.id },
    });

    const unauthIssue = await request(app).post(
      `/api/events/${event.id}/records/issue`,
    );
    expect(unauthIssue.status).toBe(401);

    const partIssue = await request(app)
      .post(`/api/events/${event.id}/records/issue`)
      .set(authHeader(participant.token));
    expect(partIssue.status).toBe(403);

    const partRevoke = await request(app)
      .post(`/api/records/${record!.id}/revoke`)
      .set(authHeader(participant.token))
      .send({ reason: "Unpermitted" });
    expect(partRevoke.status).toBe(403);
  });
});
