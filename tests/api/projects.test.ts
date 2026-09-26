import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { getTestApp, resetDatabase, createUser } from "../helpers/index.js";
import { PlatformRole } from "@prisma/client";
import { prisma } from "../../src/server/src/lib/prisma.js";

describe("api/projects", () => {
  const app = getTestApp();

  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects javascript: URLs in repoUrl and demoUrl", async () => {
    const user = await createUser({ email: "user@test.com", name: "User" });
    const organizer = await createUser({ email: "org@test.com", name: "Org", platformRole: PlatformRole.ORGANIZER });
    
    // Create event and team
    const event = await request(app)
      .post("/api/events")
      .set("Authorization", `Bearer ${organizer.token}`)
      .send({
        name: "Test Event",
        submissionsOpen: "2026-06-01T00:00:00.000Z",
        submissionsClose: "2030-06-20T00:00:00.000Z",
        maxTeamSize: 4,
        reviewsPerProject: 2,
        tracks: [{ name: "General", description: "" }],
        prizes: [],
      });
      
    const eventId = event.body.event.id;
    const trackId = event.body.event.tracks[0].id;
    
    await prisma.event.update({ where: { id: eventId }, data: { publishedAt: new Date() } });

    await request(app)
      .post(`/api/events/${eventId}/teams`)
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: "My Team" });

    const createProject = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        eventId,
        title: "Bad Project",
        summary: "Summary text",
        repoUrl: "javascript:alert(1)",
        demoUrl: "https://example.com",
        trackId,
      });

    expect(createProject.status).toBe(400);
    expect(createProject.body.error.code).toBe("validation_error");
  });
});
