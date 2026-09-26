import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { getTestApp, resetDatabase, createUser } from "../helpers/index.js";
import { PlatformRole, ProjectStatus } from "@prisma/client";
import { prisma } from "../../src/server/src/lib/prisma.js";

describe("api/projects/submit", () => {
  const app = getTestApp();

  beforeEach(async () => {
    await resetDatabase();
  });

  it("reads and stores trackId when submitting a project", async () => {
    const admin = await createUser({ email: "admin@test.com", name: "Admin", platformRole: PlatformRole.ADMIN });
    const user = await createUser({ email: "participant@test.com", name: "User" });
    
    // Create event, track, team, project
    const event = await request(app)
      .post("/api/events")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        name: "Test Event",
        submissionsOpen: "2026-06-01T00:00:00.000Z",
        submissionsClose: "2030-06-20T00:00:00.000Z",
        maxTeamSize: 4,
        reviewsPerProject: 2,
        tracks: [{ name: "Track A", description: "" }, { name: "Track B", description: "" }],
        prizes: [],
      });
      
    const eventId = event.body.event.id;
    const trackAId = event.body.event.tracks.find((t: any) => t.name === "Track A").id;
    const trackBId = event.body.event.tracks.find((t: any) => t.name === "Track B").id;
    
    await prisma.event.update({ where: { id: eventId }, data: { publishedAt: new Date() } });

    await request(app)
      .post(`/api/events/${eventId}/teams`)
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: "Team 1" });

    const createProject = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        eventId,
        title: "Test Project",
        summary: "Summary text",
        repoUrl: "https://github.com",
        demoUrl: "https://example.com",
        trackId: trackAId,
      });

    const projectId = createProject.body.project.id;

    // Submit project with a new trackId
    const submitProject = await request(app)
      .post(`/api/projects/${projectId}/submit`)
      .set("Authorization", `Bearer ${user.token}`)
      .send({ trackId: trackBId });

    expect(submitProject.status).toBe(200);
    expect(submitProject.body.project.trackId).toBe(trackBId);
    expect(submitProject.body.project.status).toBe(ProjectStatus.SUBMITTED);
  });
});
