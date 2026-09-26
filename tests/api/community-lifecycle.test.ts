import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { PlatformRole } from "@prisma/client";
import { prisma } from "../../src/server/src/lib/prisma.js";
import {
  authHeader,
  clearFixedClock,
  createUser,
  getTestApp,
  resetDatabase,
  setFixedClock,
} from "../helpers/index.js";

describe("api/community-lifecycle", () => {
  const app = getTestApp();

  beforeEach(async () => {
    await resetDatabase();
    clearFixedClock();
  });

  afterEach(() => {
    clearFixedClock();
  });

  it("runs the full T3 community voting and comments flow", async () => {
    // 1. Create event with voting window
    setFixedClock("2026-06-01T12:00:00.000Z");
    const organizer = await createUser({
      email: "t3-org@test.local",
      name: "T3 Org",
      platformRole: PlatformRole.ORGANIZER,
    });

    const created = await request(app)
      .post("/api/events")
      .set(authHeader(organizer.token))
      .send({
        name: "T3 Hack",
        description: "Community features",
        submissionsOpen: "2026-06-01T00:00:00.000Z",
        submissionsClose: "2026-06-20T00:00:00.000Z",
        votingOpen: "2026-06-21T00:00:00.000Z",
        votingClose: "2026-06-25T00:00:00.000Z",
        tracks: [
          { name: "Track A", description: "" },
          { name: "Track B", description: "" },
        ],
      });
    expect(created.status).toBe(201);
    const eventId = created.body.event.id as string;
    const trackAId = created.body.event.tracks.find((t: any) => t.name === "Track A").id as string;

    await request(app)
      .post(`/api/events/${eventId}/publish`)
      .set(authHeader(organizer.token))
      .expect(200);

    // 2. Teams submit
    const team1Owner = await createUser({ email: "team1@test.local", name: "Team 1" });
    await request(app).post(`/api/events/${eventId}/teams`).set(authHeader(team1Owner.token)).send({ name: "Team 1" });
    const p1 = await request(app)
      .post("/api/projects")
      .set(authHeader(team1Owner.token))
      .send({
        eventId,
        title: "Project 1",
        summary: "P1",
        trackId: trackAId,
        repoUrl: "https://example.com/p1",
      });
    expect(p1.status).toBe(201);
    const p1Id = p1.body.project.id;
    await request(app).post(`/api/projects/${p1Id}/submit`).set(authHeader(team1Owner.token)).expect(200);

    const team2Owner = await createUser({ email: "team2@test.local", name: "Team 2" });
    await request(app).post(`/api/events/${eventId}/teams`).set(authHeader(team2Owner.token)).send({ name: "Team 2" });
    const p2 = await request(app)
      .post("/api/projects")
      .set(authHeader(team2Owner.token))
      .send({
        eventId,
        title: "Project 2",
        summary: "P2",
        trackId: trackAId,
        repoUrl: "https://example.com/p2",
      });
    const p2Id = p2.body.project.id;
    await request(app).post(`/api/projects/${p2Id}/submit`).set(authHeader(team2Owner.token)).expect(200);

    // Create regular voters before voting opens so they aren't flagged
    const voter1 = await createUser({ email: "v1@test.local", name: "V1" });
    const voter2 = await createUser({ email: "v2@test.local", name: "V2" });
    await prisma.user.updateMany({
      where: { id: { in: [voter1.id, voter2.id] } },
      data: { createdAt: new Date("2026-06-01T00:00:00.000Z") }
    });

    // 3. Voting opens
    setFixedClock("2026-06-22T12:00:00.000Z");


    
    // A new-account voter (account created after voting opened) gets flagged
    const flagger = await createUser({ email: "flagged@test.local", name: "Flagger" });

    // 4. Voters vote
    await request(app).post(`/api/events/${eventId}/votes`).set(authHeader(voter1.token)).send({ projectId: p1Id }).expect(200);
    await request(app).post(`/api/events/${eventId}/votes`).set(authHeader(voter2.token)).send({ projectId: p1Id }).expect(200);
    
    const flaggerVote = await request(app).post(`/api/events/${eventId}/votes`).set(authHeader(flagger.token)).send({ projectId: p2Id }).expect(200);

    // 5. Results hidden for organizer and public during voting
    await request(app).get(`/api/events/${eventId}/community-results`).expect(403);
    await request(app).get(`/api/events/${eventId}/community-results`).set(authHeader(organizer.token)).expect(403);

    // Organizer can see turnout
    const turnout = await request(app).get(`/api/events/${eventId}/community-turnout`).set(authHeader(organizer.token));
    expect(turnout.status).toBe(200);
    expect(turnout.body.totalVotes).toBe(3);
    console.log("Turnout flagged:", turnout.body);
    expect(turnout.body.uniqueVoters).toBe(3);
    const flaggedLog = await request(app).get(`/api/events/${eventId}/votes/flagged`).set(authHeader(organizer.token));
    expect(turnout.body.flaggedCount).toBe(1);

    // 6. Comment posted and hidden by organizer
    const comment = await request(app).post(`/api/projects/${p1Id}/comments`).set(authHeader(voter1.token)).send({ body: "Hello" });
    expect(comment.status).toBe(201);
    const commentId = comment.body.id;

    await request(app).post(`/api/comments/${commentId}/hide`).set(authHeader(organizer.token)).send({ reason: "spam" }).expect(200);

    // 7. Voting closes
    setFixedClock("2026-06-26T12:00:00.000Z");

    // 8. Organizer voids the flagged vote
    const flaggedList = await request(app).get(`/api/events/${eventId}/votes/flagged`).set(authHeader(organizer.token));
    expect(flaggedList.body).toHaveLength(1);
    const voteId = flaggedList.body[0].id;
    
    await request(app).post(`/api/votes/${voteId}/void`).set(authHeader(organizer.token)).send({ reason: "new account abuse" }).expect(200);

    // 9. Public community results show correct counts and exclude voided vote
    const results = await request(app).get(`/api/events/${eventId}/community-results`);
    expect(results.status).toBe(200);
    
    console.log("Results body:", JSON.stringify(results.body, null, 2));

    const trackRes = results.body[trackAId] || [];
    const proj1Res = trackRes.find((p: any) => p.projectId === p1Id);
    const proj2Res = trackRes.find((p: any) => p.projectId === p2Id);
    
    expect(proj1Res.votes).toBe(2);
    expect(proj1Res.votes).toBe(2);
    expect(proj2Res).toBeUndefined(); // 1 vote but it was voided, so it's not returned

    // 10. Audit log contains every step
    const audits = await request(app).get(`/api/events/${eventId}/audit?page=1&pageSize=100`).set(authHeader(organizer.token));
    const summaries = audits.body.items.map((a: any) => a.summary);
    
    expect(summaries).toContainEqual(expect.stringContaining("comment.hide"));
    expect(summaries).toContainEqual(expect.stringContaining("vote.void"));
  });
});
