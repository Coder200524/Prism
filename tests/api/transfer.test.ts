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
import { runSeed } from "../../src/server/src/seed/index.js";

describe("Bulk Import and Export API (/api/events/:eventId/export.json & /api/import)", () => {
  const app = getTestApp();

  beforeEach(async () => {
    await resetDatabase();
    clearFixedClock();
  });

  afterEach(() => {
    clearFixedClock();
  });

  it("exports an event JSON without secrets and imports it idempotently", async () => {
    // Seed fixtures to populate evt_01
    await runSeed();

    const organizer = await createUser({
      email: "export_org@test.local",
      name: "Export Org",
      platformRole: PlatformRole.ORGANIZER,
    });
    await grantEventRole(organizer.id, "evt_01", EventRoleType.ORGANIZER);

    // 1. Export evt_01
    const exportRes = await request(app)
      .get("/api/events/evt_01/export.json")
      .set(authHeader(organizer.token));

    expect(exportRes.status).toBe(200);
    expect(exportRes.body.format).toBe("dogfood-event");
    expect(exportRes.body.event.id).toBe("evt_01");
    expect(exportRes.body.tracks.length).toBeGreaterThan(0);
    expect(exportRes.body.judges.length).toBeGreaterThan(0);
    expect(exportRes.body.teams.length).toBeGreaterThan(0);
    expect(exportRes.body.projects.length).toBeGreaterThan(0);

    // Sanity check: Ensure no secrets exist in the exported payload
    const rawExport = JSON.stringify(exportRes.body);
    expect(rawExport).not.toContain("passwordHash");
    expect(rawExport).not.toContain("keyHash");
    expect(rawExport).not.toContain("tokenHash");
    expect(rawExport).not.toContain("password_hash");

    // 2. Reset database and run dryRun import
    await resetDatabase();
    const admin = await createUser({
      email: "imp_admin@test.local",
      name: "Imp Admin",
      platformRole: PlatformRole.ADMIN,
    });

    const dryRunRes = await request(app)
      .post("/api/import?dryRun=true")
      .set(authHeader(admin.token))
      .send(exportRes.body);

    expect(dryRunRes.status).toBe(200);
    expect(dryRunRes.body.dryRun).toBe(true);
    expect(dryRunRes.body.summary.eventsToCreate).toBe(1);
    expect(dryRunRes.body.summary.tracksToCreate).toBeGreaterThan(0);

    // Verify dryRun wrote NOTHING to DB (except admin user)
    const eventCountAfterDryRun = await prisma.event.count();
    expect(eventCountAfterDryRun).toBe(0);

    // 3. Real import
    const realImportRes = await request(app)
      .post("/api/import?dryRun=false")
      .set(authHeader(admin.token))
      .send(exportRes.body);

    if (realImportRes.status !== 200) {
      console.error("realImportRes error:", JSON.stringify(realImportRes.body, null, 2));
    }
    expect(realImportRes.status).toBe(200);
    expect(realImportRes.body.dryRun).toBe(false);
    expect(realImportRes.body.summary.eventsToCreate).toBe(1);

    const importedEvent = await prisma.event.findUnique({ where: { id: "evt_01" } });
    expect(importedEvent).not.toBeNull();
    expect(importedEvent?.name).toBe(exportRes.body.event.name);

    // 4. Test idempotency (importing the same payload second time)
    const secondImportRes = await request(app)
      .post("/api/import?dryRun=false")
      .set(authHeader(admin.token))
      .send(exportRes.body);

    expect(secondImportRes.status).toBe(200);
    expect(secondImportRes.body.summary.eventsToCreate).toBe(0);
  });

  it("exports projects.csv and judges.csv", async () => {
    const organizer = await createUser({
      email: "csv_org@test.local",
      name: "CSV Org",
      platformRole: PlatformRole.ORGANIZER,
    });
    const event = await createEvent({ name: "CSV Event" });
    await grantEventRole(organizer.id, event.id, EventRoleType.ORGANIZER);

    // Projects CSV
    const projCsvRes = await request(app)
      .get(`/api/events/${event.id}/export/projects.csv`)
      .set(authHeader(organizer.token));

    expect(projCsvRes.status).toBe(200);
    expect(projCsvRes.header["content-type"]).toContain("text/csv");
    expect(projCsvRes.text).toContain("id,title,track,team,status");

    // Judges CSV
    const judgeCsvRes = await request(app)
      .get(`/api/events/${event.id}/export/judges.csv`)
      .set(authHeader(organizer.token));

    expect(judgeCsvRes.status).toBe(200);
    expect(judgeCsvRes.header["content-type"]).toContain("text/csv");
    expect(judgeCsvRes.text).toContain("email,name,tracks");
  });

  it("imports judges from CSV file", async () => {
    const organizer = await createUser({
      email: "jcsv_org@test.local",
      name: "Judge CSV Org",
      platformRole: PlatformRole.ORGANIZER,
    });
    const event = await createEvent({ name: "Judge CSV Event" });
    await grantEventRole(organizer.id, event.id, EventRoleType.ORGANIZER);

    const csvData = `email,name,tracks
imported_j1@test.local,Imported Judge 1,
imported_j2@test.local,Imported Judge 2,
`;

    // Dry run
    const dryRes = await request(app)
      .post(`/api/events/${event.id}/import/judges.csv?dryRun=true`)
      .set(authHeader(organizer.token))
      .set("Content-Type", "text/csv")
      .send(csvData);

    expect(dryRes.status).toBe(200);
    expect(dryRes.body.dryRun).toBe(true);
    expect(dryRes.body.summary.invitesToCreate).toBe(2);

    // Real import
    const realRes = await request(app)
      .post(`/api/events/${event.id}/import/judges.csv?dryRun=false`)
      .set(authHeader(organizer.token))
      .set("Content-Type", "text/csv")
      .send(csvData);

    expect(realRes.status).toBe(200);
    expect(realRes.body.summary.invitesCreated).toBe(2);

    const invites = await prisma.judgeInvite.findMany({ where: { eventId: event.id } });
    expect(invites).toHaveLength(2);
  });

  it("returns 400 bad request for malformed import payload", async () => {
    const admin = await createUser({
      email: "bad_admin@test.local",
      name: "Bad Admin",
      platformRole: PlatformRole.ADMIN,
    });

    const badRes = await request(app)
      .post("/api/import")
      .set(authHeader(admin.token))
      .send({ event: { invalidField: 123 } });

    expect(badRes.status).toBe(400);
    expect(badRes.body.error.code).toBe("bad_request");
  });

  it("does not overwrite existing assignment scores on JSON re-import", async () => {
    await runSeed({ seedDemo: false, publicUrl: "http://localhost:8080" });

    const admin = await createUser({
      email: "score_imp@test.local",
      name: "Score Imp",
      platformRole: PlatformRole.ADMIN,
    });

    const assignment = await prisma.assignment.findFirstOrThrow({
      where: { eventId: "evt_01", status: "SUBMITTED" },
      include: { scores: true },
    });
    expect(assignment.scores.length).toBeGreaterThan(0);
    const originalValues = assignment.scores.map((s) => ({
      criterionId: s.criterionId,
      value: s.value,
    }));
    const originalComment = assignment.comment;

    await prisma.criterionScore.update({
      where: {
        assignmentId_criterionId: {
          assignmentId: assignment.id,
          criterionId: originalValues[0]!.criterionId,
        },
      },
      data: { value: 1 },
    });
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { comment: "Organizer protected comment" },
    });

    const exportRes = await request(app)
      .get("/api/events/evt_01/export.json")
      .set(authHeader(admin.token));
    expect(exportRes.status).toBe(200);

    // Mutate exported score payload to a different value for the same judge/project.
    const payload = exportRes.body as {
      scores: Array<{
        judgeId?: string;
        judge?: string;
        projectId?: string;
        project?: string;
        criteria?: Record<string, number>;
        comment?: string;
      }>;
    };
    for (const score of payload.scores) {
      if (score.criteria) {
        for (const key of Object.keys(score.criteria)) {
          score.criteria[key] = 5;
        }
      }
      score.comment = "Import should not win";
    }

    const importRes = await request(app)
      .post("/api/import?dryRun=false")
      .set(authHeader(admin.token))
      .send(payload);
    expect(importRes.status).toBe(200);

    const after = await prisma.assignment.findUniqueOrThrow({
      where: { id: assignment.id },
      include: { scores: true },
    });
    expect(after.comment).toBe("Organizer protected comment");
    const protectedScore = after.scores.find(
      (s) => s.criterionId === originalValues[0]!.criterionId,
    );
    expect(protectedScore?.value).toBe(1);

    // Second identical import remains non-destructive.
    const again = await request(app)
      .post("/api/import?dryRun=false")
      .set(authHeader(admin.token))
      .send(payload);
    expect(again.status).toBe(200);
    const afterAgain = await prisma.criterionScore.findUniqueOrThrow({
      where: {
        assignmentId_criterionId: {
          assignmentId: assignment.id,
          criterionId: originalValues[0]!.criterionId,
        },
      },
    });
    expect(afterAgain.value).toBe(1);
  }, 120000);

  it("rejects cross-event references and rolls back the import", async () => {
    const admin = await createUser({
      email: "xevt_admin@test.local",
      name: "XEvt Admin",
      platformRole: PlatformRole.ADMIN,
    });
    const eventA = await createEvent({ name: "Import Event A" });
    const eventB = await createEvent({ name: "Import Event B" });

    const trackB = await prisma.track.create({
      data: { eventId: eventB.id, name: "Foreign Track", description: "" },
    });
    const teamB = await prisma.team.create({
      data: { eventId: eventB.id, name: "Foreign Team", inviteCode: "xevt_team" },
    });

    const beforeProjects = await prisma.project.count({ where: { eventId: eventA.id } });

    const badImport = await request(app)
      .post("/api/import?dryRun=false")
      .set(authHeader(admin.token))
      .send({
        event: { id: eventA.id, name: eventA.name },
        tracks: [],
        prizes: [],
        criteria: [],
        judges: [],
        teams: [{ id: "tm_new_a", name: "Local Team", members: [] }],
        projects: [
          {
            title: "Should Not Persist",
            teamId: teamB.id,
            trackId: trackB.id,
            status: "SUBMITTED",
          },
        ],
        scores: [],
      });

    expect(badImport.status).toBe(400);
    expect(badImport.body.error.message).toMatch(/does not belong to event/i);

    const afterProjects = await prisma.project.count({ where: { eventId: eventA.id } });
    expect(afterProjects).toBe(beforeProjects);
    const leaked = await prisma.project.findFirst({
      where: { eventId: eventA.id, title: "Should Not Persist" },
    });
    expect(leaked).toBeNull();
  });

  it("imports the same judge CSV twice without duplicating invites", async () => {
    const organizer = await createUser({
      email: "idem_jcsv@test.local",
      name: "Idem Judge CSV",
      platformRole: PlatformRole.ORGANIZER,
    });
    const event = await createEvent({ name: "Idempotent Judge CSV" });
    await grantEventRole(organizer.id, event.id, EventRoleType.ORGANIZER);

    const csvData = `email,name,tracks
"alice@test.local","Alice Judge",
alice@test.local,Alice Dup Row,
bob@test.local,Bob Judge,
`;

    const first = await request(app)
      .post(`/api/events/${event.id}/import/judges.csv?dryRun=false`)
      .set(authHeader(organizer.token))
      .set("Content-Type", "text/csv")
      .send(csvData);
    expect(first.status).toBe(200);
    expect(first.body.summary.invitesCreated).toBe(2);

    const second = await request(app)
      .post(`/api/events/${event.id}/import/judges.csv?dryRun=false`)
      .set(authHeader(organizer.token))
      .set("Content-Type", "text/csv")
      .send(csvData);
    expect(second.status).toBe(200);
    expect(second.body.summary.invitesCreated).toBe(0);
    expect(second.body.summary.skippedExisting).toBe(2);

    const invites = await prisma.judgeInvite.findMany({ where: { eventId: event.id } });
    expect(invites).toHaveLength(2);
    const emails = invites.map((i) => i.email.toLowerCase()).sort();
    expect(emails).toEqual(["alice@test.local", "bob@test.local"]);
  });

  it("does not duplicate prizes on identical JSON re-import", async () => {
    const admin = await createUser({
      email: "prize_imp@test.local",
      name: "Prize Imp",
      platformRole: PlatformRole.ADMIN,
    });

    const payload = {
      event: { id: "evt_prize_idem", name: "Prize Idempotency Event" },
      tracks: [{ id: "trk_prize_1", name: "Main" }],
      prizes: [
        {
          id: "prz_first",
          name: "Grand Prize",
          description: "Best overall",
          value: "$1000",
          place: 1,
          trackId: "trk_prize_1",
        },
        {
          id: "prz_second",
          name: "Runner Up",
          description: "Second place",
          value: "$250",
          place: 2,
        },
      ],
      criteria: [],
      judges: [],
      teams: [],
      projects: [],
      scores: [],
    };

    const first = await request(app)
      .post("/api/import?dryRun=false")
      .set(authHeader(admin.token))
      .send(payload);
    expect(first.status).toBe(200);

    const afterFirst = await prisma.prize.findMany({
      where: { eventId: "evt_prize_idem" },
      orderBy: { name: "asc" },
    });
    expect(afterFirst).toHaveLength(2);
    const snapshot = afterFirst.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      value: p.value,
      place: p.place,
    }));

    const second = await request(app)
      .post("/api/import?dryRun=false")
      .set(authHeader(admin.token))
      .send(payload);
    expect(second.status).toBe(200);

    const afterSecond = await prisma.prize.findMany({
      where: { eventId: "evt_prize_idem" },
      orderBy: { name: "asc" },
    });
    expect(afterSecond).toHaveLength(2);
    expect(
      afterSecond.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        value: p.value,
        place: p.place,
      })),
    ).toEqual(snapshot);
  });

  it("rejects import to existing event by non-organizer and rejects API keys", async () => {
    const admin = await createUser({ email: "imp_admin2@test.local", name: "Admin", platformRole: PlatformRole.ADMIN });
    const evt = await createEvent({ id: "evt_secure", name: "Secure Event" });
    const otherOrg = await createUser({ email: "other_org@test.local", name: "Other Org", platformRole: PlatformRole.ORGANIZER });
    await createEvent({ id: "evt_other" });

    // API key creation
    const keyResRaw = await request(app)
      .post("/api/api-keys")
      .set(authHeader(admin.token))
      .send({ name: "Global Key", scopes: ["read", "write"] });
    const apiKeyStr = keyResRaw.body.key;

    const payload = {
      event: { id: "evt_secure", name: "Secure Event" },
      tracks: [], prizes: [], criteria: [], judges: [], teams: [], projects: [], scores: []
    };

    // 1. Other organizer 403
    const badOrgRes = await request(app).post("/api/import?dryRun=false").set(authHeader(otherOrg.token)).send(payload);
    expect(badOrgRes.status).toBe(403);

    const badOrgDryRes = await request(app).post("/api/import?dryRun=true").set(authHeader(otherOrg.token)).send(payload);
    expect(badOrgDryRes.status).toBe(403);

    // 2. API key 403
    const keyRes = await request(app).post("/api/import?dryRun=false").set("Authorization", `Bearer ${apiKeyStr}`).send(payload);
    expect(keyRes.status).toBe(403);
  });

  it("validates scores ranges, criteria, and project submittedAt", async () => {
    const admin = await createUser({ email: "imp_admin3@test.local", name: "Admin", platformRole: PlatformRole.ADMIN });
    const payload = {
      event: { id: "evt_val", name: "Val Event", submissionsClose: "2026-09-28T18:00:00Z" },
      tracks: [], prizes: [], 
      criteria: [
        { key: "crit1", name: "Crit 1", weight: 100, minScore: 1, maxScore: 5 }
      ], 
      judges: [{ email: "j1@test.local", name: "J1" }], 
      teams: [
        { name: "Team 1", members: ["j1@test.local"] }
      ], 
      projects: [
        { title: "Proj 1", team: "Team 1", submittedAt: "2026-09-29T18:00:00Z" },
        { title: "Proj 2", team: "Team 1", submittedAt: "2026-09-27T18:00:00Z" }
      ], 
      scores: [
        { project: "Proj 2", judge: "j1@test.local", criteria: { "crit1": 10 } },
        { project: "Proj 2", judge: "j1@test.local", criteria: { "crit_missing": 3 } },
        { project: "Proj 2", judge: "j1@test.local", criteria: { "crit1": 3 } }
      ]
    };

    // 1. Late submittedAt
    const p1 = await request(app).post("/api/import?dryRun=false").set(authHeader(admin.token)).send(payload);
    expect(p1.status).toBe(400);
    expect(p1.body.error.details[0].message).toMatch(/after event submissionsClose/);

    // fix submittedAt
    payload.projects[0].submittedAt = "2026-09-27T18:00:00Z";

    // 2. Out of range score
    const p2 = await request(app).post("/api/import?dryRun=false").set(authHeader(admin.token)).send(payload);
    expect(p2.status).toBe(400);
    expect(p2.body.error.details[0].message).toMatch(/Score must be an integer between 1 and 5/);

    // fix out of range score
    payload.scores[0].criteria["crit1"] = 3;

    // 3. Unknown criterion
    const p3 = await request(app).post("/api/import?dryRun=false").set(authHeader(admin.token)).send(payload);
    expect(p3.status).toBe(400);
    expect(p3.body.error.details[0].message).toMatch(/Unknown criterion/);

    // fix unknown criterion
    payload.scores[1].criteria = { "crit1": 3 };

    // 4. Judge conflict of interest
    const p4 = await request(app).post("/api/import?dryRun=false").set(authHeader(admin.token)).send(payload);
    expect(p4.status).toBe(400);
    expect(p4.body.error.details[0].message).toMatch(/Judge cannot score their own team/);
  });
});
