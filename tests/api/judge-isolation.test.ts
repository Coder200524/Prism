import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  authHeader,
  clearFixedClock,
  getTestApp,
  resetDatabase,
  seedPermissionScenario,
  setFixedClock,
  type Scenario,
} from "../helpers/index.js";

describe("api/judge-isolation", () => {
  const app = getTestApp();
  let scenario: Scenario;

  beforeEach(async () => {
    clearFixedClock();
    await resetDatabase();
    scenario = await seedPermissionScenario();
    // Move clock into judging so scores can be saved by the owner.
    setFixedClock("2026-06-21T12:00:00.000Z");
  });

  it("blocks judge B from judge A's assignment detail", async () => {
    const denied = await request(app)
      .get(`/api/judge/assignments/${scenario.assignmentAId}`)
      .set(authHeader(scenario.judgeB.token));
    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .get(`/api/judge/assignments/${scenario.assignmentAId}`)
      .set(authHeader(scenario.judgeA.token));
    expect(allowed.status).toBe(200);
  });

  it("blocks judge B from reading judge A's scores", async () => {
    const denied = await request(app)
      .get(
        `/api/judge/scores?judge=${scenario.judgeA.id}&eventId=${scenario.eventId}`,
      )
      .set(authHeader(scenario.judgeB.token));
    expect(denied.status).toBe(403);
    expect(denied.body.error.message).toContain("Judges can only view their own scores");
  });

  it("blocks judge B from writing scores on judge A's assignment", async () => {
    const denied = await request(app)
      .put(`/api/judge/assignments/${scenario.assignmentAId}/scores`)
      .set(authHeader(scenario.judgeB.token))
      .send({ scores: { quality: 3, impact: 3 }, comment: "", submit: false });
    expect(denied.status).toBe(403);
  });

  it("allows organizer to read judge A's scores and assignment detail", async () => {
    const scores = await request(app)
      .get(
        `/api/judge/scores?judge=${scenario.judgeA.id}&eventId=${scenario.eventId}`,
      )
      .set(authHeader(scenario.organizer.token));
    expect(scores.status).toBe(200);

    const detail = await request(app)
      .get(`/api/judge/assignments/${scenario.assignmentAId}`)
      .set(authHeader(scenario.organizer.token));
    expect(detail.status).toBe(200);

    const list = await request(app)
      .get(`/api/events/${scenario.eventId}/assignments`)
      .set(authHeader(scenario.organizer.token));
    expect(list.status).toBe(200);
    expect(list.body.assignments.length).toBeGreaterThan(0);
  });
});
