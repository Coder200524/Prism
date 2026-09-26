import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../../src/server/src/lib/prisma.js";
import { getTestApp, resetDatabase, seedPermissionScenario, type Scenario } from "../helpers/index.js";
import { setFixedClock } from "../helpers/clock.js";

describe("api/community/results", () => {
  const app = getTestApp();
  let sc: Scenario;

  beforeEach(async () => {
    // Isolated data! No resetDatabase() to avoid breaking parallel tests
    sc = await seedPermissionScenario(`-results-${Date.now()}-${Math.random()}`);
  });

  it("results are hidden for everyone during voting", async () => {
    const resOrg = await request(app)
      .get(`/api/events/${sc.eventId}/community-results`)
      .set("Authorization", `Bearer ${sc.organizer.token}`);
    expect(resOrg.status).toBe(403);
    
    const resPub = await request(app)
      .get(`/api/events/${sc.eventId}/community-results`);
    expect(resPub.status).toBe(403);
  });

  it("results are public after voting closes and correctly tally non-voided votes", async () => {
    // Cast some votes
    // participant already voted in scenario! So we just add judgeA and judgeB.
    await prisma.vote.createMany({
      data: [
        { eventId: sc.eventId, voterId: sc.judgeA.id, projectId: sc.projectId, trackId: sc.trackId, ipHash: "2", userAgentHash: "2", flagged: true }, // flagged, not voided
        { eventId: sc.eventId, voterId: sc.judgeB.id, projectId: sc.projectId, trackId: sc.trackId, ipHash: "3", userAgentHash: "3", flagged: false, voidedAt: new Date() }, // voided
      ]
    });

    // Move time past votingClose
    const event = await prisma.event.findUnique({ where: { id: sc.eventId } });
    const closeTime = new Date("2026-06-25T00:00:00Z");
    await prisma.event.update({
      where: { id: sc.eventId },
      data: { votingClose: closeTime }
    });
    setFixedClock(new Date(closeTime.getTime() + 1000).toISOString());

    const res = await request(app).get(`/api/events/${sc.eventId}/community-results`);
    expect(res.status).toBe(200);

    const trackResults = res.body[sc.trackId];
    expect(trackResults).toBeDefined();

    const projStat = trackResults.find((r: any) => r.projectId === sc.projectId);
    expect(projStat).toBeDefined();
    // 1 clean vote (from participant in scenario)
    expect(projStat.votes).toBe(1);
    // 1 flagged vote excluded from 'votes'
    expect(projStat.flaggedExcluded).toBe(1);
    
    // The voided vote should be ignored completely.
  });

  it("turnout only shows numbers", async () => {
    await prisma.vote.createMany({
      data: [
        { eventId: sc.eventId, voterId: sc.judgeA.id, projectId: sc.projectId, trackId: sc.trackId, ipHash: "2", userAgentHash: "2", flagged: true }, // flagged
      ]
    });

    const res = await request(app)
      .get(`/api/events/${sc.eventId}/community-turnout`)
      .set("Authorization", `Bearer ${sc.organizer.token}`);
    
    expect(res.status).toBe(200);
    // 2 total votes (participant + judgeA)
    expect(res.body.totalVotes).toBe(2);
    expect(res.body.flaggedCount).toBe(1);
    expect(res.body.uniqueVoters).toBe(2);
    expect(res.body[sc.trackId]).toBeUndefined(); // no per-project data
  });
});
