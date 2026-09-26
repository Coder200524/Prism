import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { getTestApp, resetDatabase, createUser } from "../helpers/index.js";
import { PlatformRole, ProjectStatus } from "@prisma/client";
import { prisma } from "../../src/server/src/lib/prisma.js";

describe("api/judging/csv-bug", () => {
  const app = getTestApp();

  beforeEach(async () => {
    await resetDatabase();
  });

  it("checks csv mapping", async () => {
    const admin = await createUser({ email: "admin@test.com", name: "Admin", platformRole: PlatformRole.ADMIN });
    const user = await createUser({ email: "user@test.com", name: "User" });
    
    const event = await request(app)
      .post("/api/events")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        name: "Test Event",
        submissionsOpen: "2026-06-01T00:00:00.000Z",
        submissionsClose: "2030-06-20T00:00:00.000Z",
        maxTeamSize: 4,
        reviewsPerProject: 2,
        tracks: [{ name: "Main Track" }],
        prizes: [],
      });
      
    const eventId = event.body.event.id;
    const trackId = event.body.event.tracks[0].id;
    
    await prisma.event.update({ where: { id: eventId }, data: { publishedAt: new Date() } });

    await request(app).put(`/api/events/${eventId}/criteria`).set("Authorization", `Bearer ${admin.token}`).send({
      criteria: [
        { name: "Design", key: "design", minScore: 1, maxScore: 10, weight: 50 }, 
        { name: "Tech", key: "tech", minScore: 1, maxScore: 10, weight: 50 }
      ]
    });
    
    await prisma.eventRole.create({
      data: {
        eventId,
        userId: admin.id,
        role: "JUDGE",
      }
    });
    
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
      });

    console.log("CREATE PROJECT RESPONSE:", createProject.body);
    const projectId = createProject.body.project.id;
    
    const submitRes = await request(app)
      .post(`/api/projects/${projectId}/submit`)
      .set("Authorization", `Bearer ${user.token}`)
      .send({ trackId });
    console.log("SUBMIT PROJECT RESPONSE:", submitRes.body);


    const assignRes = await request(app)
      .post(`/api/events/${eventId}/assignments`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ projectId, judgeId: admin.id });
    console.log("ASSIGN RESPONSE:", assignRes.body);
    const assignmentId = assignRes.body.assignment.id;

    await prisma.event.update({
      where: { id: eventId },
      data: {
        submissionsClose: new Date("2026-06-01T00:00:00.000Z"),
        judgingClose: new Date("2030-06-20T00:00:00.000Z"),
      }
    });

    const putRes = await request(app)
      .put(`/api/judge/assignments/${assignmentId}/scores`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        scores: { design: 8, tech: 9 },
        comment: "Great project",
        submit: true,
      });
    console.log("PUT ASSIGNMENT RESPONSE:", putRes.body);
      
    const resultsCsv = await request(app)
      .get(`/api/events/${eventId}/export.csv?type=results`)
      .set("Authorization", `Bearer ${admin.token}`);
      
    console.log("RESULTS CSV:");
    console.log(resultsCsv.text);
    
    const scoresCsv = await request(app)
      .get(`/api/events/${eventId}/export.csv?type=scores`)
      .set("Authorization", `Bearer ${admin.token}`);
      
    console.log("SCORES CSV:");
    console.log(scoresCsv.text);
  });
});
