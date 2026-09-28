import { describe, expect, it } from "vitest";
import request from "supertest";
import { getTestApp, resetDatabase, createEvent, createUser } from "../helpers/index.js";
import { prisma } from "../../src/server/src/lib/prisma.js";
import { isValidResizeMessage } from "../../src/server/src/modules/embed/embed.service.js";

const app = getTestApp();

describe("Embed Gallery Widget API & Security Headers", () => {
  it("returns only public fields of submitted projects from published events", async () => {
    await resetDatabase();

    const event = await createEvent({ name: "Published Hackathon" });
    await createUser({ email: "org@embed.local", name: "Embed Organizer", platformRole: "ORGANIZER" });

    // Mark event as published
    await prisma.event.update({
      where: { id: event.id },
      data: { resultsPublishedAt: new Date("2026-09-27T12:00:00Z") },
    });

    const team1 = await prisma.team.create({
      data: { eventId: event.id, name: "Team Alpha", inviteCode: "alpha_code" },
    });

    const team2 = await prisma.team.create({
      data: { eventId: event.id, name: "Team Draft", inviteCode: "draft_code" },
    });

    // Create 1 submitted project and 1 draft project
    const submittedProj = await prisma.project.create({
      data: {
        eventId: event.id,
        teamId: team1.id,
        title: "Public Project",
        summary: "Public summary",
        repoUrl: "https://github.com/alpha",
        demoUrl: "https://alpha.demo",
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });

    await prisma.project.create({
      data: {
        eventId: event.id,
        teamId: team2.id,
        title: "Draft Project",
        summary: "Draft summary",
        repoUrl: "https://github.com/draft",
        demoUrl: "https://draft.demo",
        status: "DRAFT",
      },
    });

    const res = await request(app).get(`/api/embed/gallery?eventId=${event.id}`);
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(1);
    expect(res.body.projects[0].id).toBe(submittedProj.id);
    expect(res.body.projects[0].title).toBe("Public Project");
    expect(res.body.projects[0].teamName).toBe("Team Alpha");

    // Check sensitive fields like passwords or internal models are not present
    expect(res.body.projects[0].passwordHash).toBeUndefined();
    expect(res.body.projects[0].scores).toBeUndefined();
  });

  it("does not show projects from unpublished events", async () => {
    await resetDatabase();

    const unpublishedEvent = await createEvent({ name: "Unpublished Hackathon" });
    const team = await prisma.team.create({
      data: { eventId: unpublishedEvent.id, name: "Team Beta", inviteCode: "beta_code" },
    });

    await prisma.project.create({
      data: {
        eventId: unpublishedEvent.id,
        teamId: team.id,
        title: "Unpublished Project",
        summary: "Summary",
        repoUrl: "https://github.com/beta",
        demoUrl: "https://beta.demo",
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });

    const res = await request(app).get(`/api/embed/gallery?eventId=${unpublishedEvent.id}`);
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(0);
  });

  it("sets correct framing security headers for /embed routes vs normal routes", async () => {
    // 1. Embed routes allow framing
    const embedRes = await request(app).get("/embed/gallery");
    expect(embedRes.headers["x-frame-options"]).toBeUndefined();
    expect(embedRes.headers["content-security-policy"]).toContain("frame-ancestors");

    const embedJsRes = await request(app).get("/embed.js");
    expect(embedJsRes.headers["x-frame-options"]).toBeUndefined();
    expect(embedJsRes.headers["content-type"]).toContain("javascript");

    // 2. Normal routes refuse framing
    const normalRes = await request(app).get("/api/health");
    expect(normalRes.headers["x-frame-options"]).toBe("DENY");
    expect(normalRes.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  it("validates postMessage resize event origin and shape", () => {
    const origin = "http://localhost:8080";

    // Valid message
    expect(
      isValidResizeMessage(
        { origin: "http://localhost:8080", data: { type: "dogfood:resize", height: 450 } },
        origin,
      ),
    ).toBe(true);

    // Invalid origin
    expect(
      isValidResizeMessage(
        { origin: "http://malicious-site.com", data: { type: "dogfood:resize", height: 450 } },
        origin,
      ),
    ).toBe(false);

    // Invalid message type
    expect(
      isValidResizeMessage(
        { origin: "http://localhost:8080", data: { type: "other:event", height: 450 } },
        origin,
      ),
    ).toBe(false);

    // Invalid height
    expect(
      isValidResizeMessage(
        { origin: "http://localhost:8080", data: { type: "dogfood:resize", height: "450" } },
        origin,
      ),
    ).toBe(false);
  });

  it("keeps /embed/gallery as SPA HTML and /api/embed/gallery as JSON", async () => {
    await resetDatabase();
    const event = await createEvent({ name: "Embed Route Split" });
    await prisma.event.update({
      where: { id: event.id },
      data: { resultsPublishedAt: new Date("2026-09-27T12:00:00Z") },
    });

    const fs = require("node:fs");
    const path = require("node:path");
    const distExists = fs.existsSync(path.resolve(__dirname, "../../src/web/dist/index.html"));

    const pageRes = await request(app).get(`/embed/gallery?eventId=${event.id}`);
    if (distExists) {
      expect(pageRes.status).toBe(200);
      // SPA fallback serves index.html, never a JSON gallery payload.
      expect(pageRes.headers["content-type"]).toMatch(/text\/html/);
      expect(pageRes.text).not.toMatch(/"projects"\s*:/);
    } else {
      console.warn("Skipping SPA HTML assertion because src/web/dist/index.html is missing");
    }

    const apiRes = await request(app).get(`/api/embed/gallery?eventId=${event.id}`);
    expect(apiRes.status).toBe(200);
    expect(apiRes.headers["content-type"]).toMatch(/json/);
    expect(apiRes.body).toHaveProperty("projects");
    expect(Array.isArray(apiRes.body.projects)).toBe(true);

    const scriptRes = await request(app).get("/embed.js");
    expect(scriptRes.status).toBe(200);
    expect(scriptRes.text).toContain("/embed/gallery?");
    expect(scriptRes.text).not.toContain("/api/embed/gallery?");
  });
});
