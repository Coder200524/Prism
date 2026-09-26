import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { PlatformRole } from "@prisma/client";
import {
  authHeader,
  clearFixedClock,
  createUser,
  getTestApp,
  resetDatabase,
  setFixedClock,
} from "../helpers/index.js";

describe("api/lifecycle", () => {
  const app = getTestApp();

  beforeEach(async () => {
    await resetDatabase();
    clearFixedClock();
    setFixedClock("2026-06-10T12:00:00.000Z");
  });

  afterEach(() => {
    clearFixedClock();
  });

  it("runs the full T1+T2 API flow", async () => {
    const organizer = await createUser({
      email: "lifecycle-org@test.local",
      name: "Lifecycle Org",
      platformRole: PlatformRole.ORGANIZER,
    });

    const created = await request(app)
      .post("/api/events")
      .set(authHeader(organizer.token))
      .send({
        name: "Lifecycle Hack",
        description: "End to end",
        submissionsOpen: "2026-06-01T00:00:00.000Z",
        submissionsClose: "2026-06-20T00:00:00.000Z",
        maxTeamSize: 4,
        reviewsPerProject: 1,
        tracks: [{ name: "General", description: "" }],
        prizes: [{ name: "Best", description: "", value: "Mug" }],
      });
    expect(created.status).toBe(201);
    const eventId = created.body.event.id as string;
    const trackId = created.body.event.tracks[0].id as string;

    await request(app)
      .post(`/api/events/${eventId}/publish`)
      .set(authHeader(organizer.token))
      .expect(200);

    const rubric = await request(app)
      .put(`/api/events/${eventId}/criteria`)
      .set(authHeader(organizer.token))
      .send({
        criteria: [
          {
            key: "quality",
            name: "Quality",
            description: "",
            weight: 50,
            minScore: 1,
            maxScore: 5,
          },
          {
            key: "impact",
            name: "Impact",
            description: "",
            weight: 50,
            minScore: 1,
            maxScore: 5,
          },
        ],
      });
    expect(rubric.status).toBe(200);

    const alice = await createUser({ email: "alice@lifecycle.test", name: "Alice" });
    const team = await request(app)
      .post(`/api/events/${eventId}/teams`)
      .set(authHeader(alice.token))
      .send({ name: "Lifecycle Team" });
    expect(team.status).toBe(201);
    const inviteCode = team.body.team.inviteCode as string;

    const bob = await createUser({ email: "bob@lifecycle.test", name: "Bob" });
    await request(app)
      .post(`/api/teams/invite/${inviteCode}/join`)
      .set(authHeader(bob.token))
      .expect(200);

    const draft = await request(app)
      .post("/api/projects")
      .set(authHeader(alice.token))
      .send({
        eventId,
        title: "Lifecycle Project",
        summary: "A solid summary",
        repoUrl: "https://example.com/lifecycle",
        demoUrl: "",
        trackId,
      });
    expect(draft.status).toBe(201);
    const projectId = draft.body.project.id as string;

    await request(app)
      .post(`/api/projects/${projectId}/submit`)
      .set(authHeader(alice.token))
      .expect(200);

    const judge = await createUser({ email: "judge@lifecycle.test", name: "Judge" });
    const invite = await request(app)
      .post(`/api/events/${eventId}/judges/invites`)
      .set(authHeader(organizer.token))
      .send({ email: judge.email, trackIds: [trackId] });
    expect(invite.status).toBe(201);
    const inviteToken = String(invite.body.inviteUrl).split("/").pop();

    await request(app)
      .post(`/api/judge-invites/${inviteToken}/accept`)
      .set(authHeader(judge.token))
      .expect(200);

    setFixedClock("2026-06-21T12:00:00.000Z");

    const assigned = await request(app)
      .post(`/api/events/${eventId}/assignments/auto`)
      .set(authHeader(organizer.token));
    expect(assigned.status).toBe(200);
    expect(assigned.body.created).toBeGreaterThan(0);

    const assignments = await request(app)
      .get("/api/judge/assignments")
      .set(authHeader(judge.token));
    expect(assignments.status).toBe(200);
    const assignmentId = assignments.body.assignments[0].id as string;

    const scored = await request(app)
      .put(`/api/judge/assignments/${assignmentId}/scores`)
      .set(authHeader(judge.token))
      .send({
        scores: { quality: 5, impact: 4 },
        comment: "Nice work",
        submit: true,
      });
    expect(scored.status).toBe(200);
    expect(scored.body.assignment.status).toBe("SUBMITTED");

    const dashboard = await request(app)
      .get(`/api/events/${eventId}/dashboard`)
      .set(authHeader(organizer.token));
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.totals.submitted).toBeGreaterThan(0);

    const results = await request(app)
      .get(`/api/events/${eventId}/results`)
      .set(authHeader(organizer.token));
    expect(results.status).toBe(200);

    const csv = await request(app)
      .get(`/api/events/${eventId}/export.csv?type=results`)
      .set(authHeader(organizer.token));
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("rank,track,project_id");

    await request(app)
      .post(`/api/events/${eventId}/results/publish`)
      .set(authHeader(organizer.token))
      .expect(200);

    const publicResults = await request(app).get(`/api/events/${eventId}/results`);
    expect(publicResults.status).toBe(200);
    expect(publicResults.body.published).toBe(true);
    expect(publicResults.body.results.tracks[0].projects[0].title).toBe("Lifecycle Project");
  });
});
