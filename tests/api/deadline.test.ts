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

describe("api/deadline", () => {
  const app = getTestApp();

  beforeEach(async () => {
    await resetDatabase();
    clearFixedClock();
  });

  afterEach(() => {
    clearFixedClock();
  });

  async function seedOpenEvent() {
    setFixedClock("2026-06-10T12:00:00.000Z");
    const organizer = await createUser({
      email: "org@deadline.test",
      name: "Org",
      platformRole: PlatformRole.ORGANIZER,
    });
    const create = await request(app)
      .post("/api/events")
      .set(authHeader(organizer.token))
      .send({
        name: "Deadline Event",
        description: "",
        submissionsOpen: "2026-06-01T00:00:00.000Z",
        submissionsClose: "2026-06-20T00:00:00.000Z",
        maxTeamSize: 4,
        reviewsPerProject: 2,
        tracks: [{ name: "General", description: "" }],
        prizes: [],
      });
    expect(create.status).toBe(201);
    const eventId = create.body.event.id as string;
    await request(app)
      .post(`/api/events/${eventId}/publish`)
      .set(authHeader(organizer.token));
    const trackId = create.body.event.tracks[0].id as string;
    return { organizer, eventId, trackId };
  }

  it("allows create/edit/submit/team/join before the deadline", async () => {
    const { eventId, trackId } = await seedOpenEvent();
    const user = await createUser({ email: "p1@deadline.test", name: "P1" });
    const team = await request(app)
      .post(`/api/events/${eventId}/teams`)
      .set(authHeader(user.token))
      .send({ name: "Team One" });
    expect(team.status).toBe(201);

    const project = await request(app)
      .post("/api/projects")
      .set(authHeader(user.token))
      .send({
        eventId,
        title: "Proj",
        summary: "Summary text",
        repoUrl: "https://example.com/r",
        demoUrl: "",
        trackId,
      });
    expect(project.status).toBe(201);

    const patch = await request(app)
      .patch(`/api/projects/${project.body.project.id}`)
      .set(authHeader(user.token))
      .send({ summary: "Updated summary" });
    expect(patch.status).toBe(200);

    const submit = await request(app)
      .post(`/api/projects/${project.body.project.id}/submit`)
      .set(authHeader(user.token));
    expect(submit.status).toBe(200);

    const joiner = await createUser({ email: "p2@deadline.test", name: "P2" });
    const join = await request(app)
      .post(`/api/teams/invite/${team.body.team.inviteCode}/join`)
      .set(authHeader(joiner.token));
    expect(join.status).toBe(200);
  });

  it("returns 403 submissions_closed after the deadline", async () => {
    const { eventId, trackId } = await seedOpenEvent();
    const user = await createUser({ email: "early@deadline.test", name: "Early" });
    const team = await request(app)
      .post(`/api/events/${eventId}/teams`)
      .set(authHeader(user.token))
      .send({ name: "Early Team" });
    expect(team.status).toBe(201);
    const project = await request(app)
      .post("/api/projects")
      .set(authHeader(user.token))
      .send({
        eventId,
        title: "Early Proj",
        summary: "Summary text",
        repoUrl: "https://example.com/early",
        demoUrl: "",
        trackId,
      });
    expect(project.status).toBe(201);

    setFixedClock("2026-06-21T12:00:00.000Z");

    const createTeam = await request(app)
      .post(`/api/events/${eventId}/teams`)
      .set(authHeader((await createUser({ email: "late@deadline.test", name: "Late" })).token))
      .send({ name: "Late Team" });
    expect(createTeam.status).toBe(403);
    expect(createTeam.body.error.code).toBe("submissions_closed");

    const join = await request(app)
      .post(`/api/teams/invite/${team.body.team.inviteCode}/join`)
      .set(authHeader((await createUser({ email: "late2@deadline.test", name: "Late2" })).token));
    expect(join.status).toBe(403);
    expect(join.body.error.code).toBe("submissions_closed");

    const createProject = await request(app)
      .post("/api/projects")
      .set(authHeader(user.token))
      .send({
        eventId,
        title: "Too Late",
        summary: "Summary text",
        repoUrl: "https://example.com/late",
        demoUrl: "",
        trackId,
      });
    expect(createProject.status).toBe(403);
    expect(createProject.body.error.code).toBe("submissions_closed");

    const edit = await request(app)
      .patch(`/api/projects/${project.body.project.id}`)
      .set(authHeader(user.token))
      .send({ summary: "Nope" });
    expect(edit.status).toBe(403);
    expect(edit.body.error.code).toBe("submissions_closed");

    const submit = await request(app)
      .post(`/api/projects/${project.body.project.id}/submit`)
      .set(authHeader(user.token));
    expect(submit.status).toBe(403);
    expect(submit.body.error.code).toBe("submissions_closed");
  });
});
