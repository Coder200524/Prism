import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { getTestApp, resetDatabase, createUser, authHeader } from "../helpers/index.js";
import { PlatformRole } from "@prisma/client";
import { prisma } from "../../src/server/src/lib/prisma.js";
import { parseCsv } from "../../src/server/src/lib/csv.js";

describe("api/judging/csv-bug", () => {
  const app = getTestApp();

  beforeEach(async () => {
    await resetDatabase();
  });

  it("exports empty weighted_total for PENDING assignments without scores", async () => {
    const organizer = await createUser({
      email: "csv-org@test.local",
      name: "Organizer",
      platformRole: PlatformRole.ORGANIZER,
    });
    const participant = await createUser({
      email: "csv-part@test.local",
      name: "Participant",
    });
    const judge = await createUser({
      email: "csv-judge@test.local",
      name: "Judge",
    });

    const created = await request(app)
      .post("/api/events")
      .set(authHeader(organizer.token))
      .send({
        name: "CSV Event",
        submissionsOpen: "2026-06-01T00:00:00.000Z",
        submissionsClose: "2030-06-20T00:00:00.000Z",
        maxTeamSize: 4,
        reviewsPerProject: 2,
        tracks: [{ name: "Main Track", description: "" }],
        prizes: [],
      });
    expect(created.status).toBe(201);
    const eventId = created.body.event.id as string;
    const trackId = created.body.event.tracks[0].id as string;

    await request(app)
      .put(`/api/events/${eventId}/criteria`)
      .set(authHeader(organizer.token))
      .send({
        criteria: [
          { name: "Design", key: "design", minScore: 1, maxScore: 10, weight: 50 },
          { name: "Tech", key: "tech", minScore: 1, maxScore: 10, weight: 50 },
        ],
      });

    await prisma.event.update({ where: { id: eventId }, data: { publishedAt: new Date() } });
    await prisma.eventRole.createMany({
      data: [
        { eventId, userId: judge.id, role: "JUDGE" },
        { eventId, userId: participant.id, role: "PARTICIPANT" },
      ],
    });

    await request(app)
      .post(`/api/events/${eventId}/teams`)
      .set(authHeader(participant.token))
      .send({ name: "CSV Team" });

    const projectRes = await request(app)
      .post("/api/projects")
      .set(authHeader(participant.token))
      .send({
        eventId,
        title: "CSV Project",
        summary: "Summary",
        repoUrl: "https://github.com/example/repo",
        demoUrl: "",
        trackId,
      });
    const projectId = projectRes.body.project.id as string;

    await request(app)
      .post(`/api/projects/${projectId}/submit`)
      .set(authHeader(participant.token))
      .send({ trackId });

    const assignRes = await request(app)
      .post(`/api/events/${eventId}/assignments`)
      .set(authHeader(organizer.token))
      .send({ projectId, judgeId: judge.id });
    expect(assignRes.status).toBe(201);

    await prisma.event.update({
      where: { id: eventId },
      data: {
        submissionsClose: new Date("2020-01-01T00:00:00.000Z"),
        judgingClose: new Date("2030-06-20T00:00:00.000Z"),
      },
    });

    const scoresCsv = await request(app)
      .get(`/api/events/${eventId}/export.csv?type=scores`)
      .set(authHeader(organizer.token));
    expect(scoresCsv.status).toBe(200);

    const rows = parseCsv(scoresCsv.text);
    const header = rows[0]!;
    const weightedIdx = header.indexOf("weighted_total");
    expect(weightedIdx).toBeGreaterThan(-1);

    const dataRow = rows.find((row) => row[header.indexOf("status")] === "PENDING");
    expect(dataRow).toBeDefined();
    expect(dataRow![weightedIdx]).toBe("");
  });
});
