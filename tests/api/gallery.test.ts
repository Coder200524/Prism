import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { EventRoleType, PlatformRole, ProjectStatus } from "@prisma/client";
import { prisma } from "../../src/server/src/lib/prisma.js";
import {
  clearFixedClock,
  createUser,
  getTestApp,
  grantEventRole,
  resetDatabase,
  setFixedClock,
} from "../helpers/index.js";

describe("api/gallery", () => {
  const app = getTestApp();

  beforeEach(async () => {
    await resetDatabase();
    clearFixedClock();
    setFixedClock("2026-06-15T12:00:00.000Z");
  });

  afterEach(() => {
    clearFixedClock();
  });

  async function seedGalleryProjects() {
    const organizer = await createUser({
      email: "gallery-org@test.local",
      name: "Gallery Org",
      platformRole: PlatformRole.ORGANIZER,
    });
    const participantA = await createUser({
      email: "gallery-part-a@test.local",
      name: "Gallery Participant A",
    });
    const participantB = await createUser({
      email: "gallery-part-b@test.local",
      name: "Gallery Participant B",
    });

    const event = await prisma.event.create({
      data: {
        name: "Gallery Event",
        submissionsOpen: new Date("2026-06-01T00:00:00.000Z"),
        submissionsClose: new Date("2026-06-20T00:00:00.000Z"),
        publishedAt: new Date("2026-06-01T00:00:00.000Z"),
        maxTeamSize: 4,
        reviewsPerProject: 1,
      },
    });
    await grantEventRole(organizer.id, event.id, EventRoleType.ORGANIZER);
    await grantEventRole(participantA.id, event.id, EventRoleType.PARTICIPANT);
    await grantEventRole(participantB.id, event.id, EventRoleType.PARTICIPANT);

    const track = await prisma.track.create({
      data: { eventId: event.id, name: "General", description: "" },
    });

    async function submittedProject(
      teamName: string,
      title: string,
      summary: string,
      ownerId: string,
    ) {
      const team = await prisma.team.create({
        data: {
          eventId: event.id,
          name: teamName,
          inviteCode: `invite-${teamName.replace(/\s/g, "-")}`,
        },
      });
      await prisma.teamMember.create({
        data: { teamId: team.id, userId: ownerId, eventId: event.id },
      });
      return prisma.project.create({
        data: {
          eventId: event.id,
          teamId: team.id,
          trackId: track.id,
          title,
          summary,
          repoUrl: "https://example.com/repo",
          demoUrl: "",
          status: ProjectStatus.SUBMITTED,
          submittedAt: new Date("2026-06-10T00:00:00.000Z"),
        },
      });
    }

    await submittedProject(
      "Team Alpha",
      "Solar Panel Optimizer",
      "Renewable energy tooling",
      participantA.id,
    );
    await submittedProject(
      "Team Beta",
      "Cloud Cost Monitor",
      "FinOps dashboard for startups",
      participantB.id,
    );

    return { eventId: event.id };
  }

  it("does not treat SQL wildcards in q as match-all patterns", async () => {
    const { eventId } = await seedGalleryProjects();

    const baseline = await request(app).get("/api/projects").query({ eventId });
    expect(baseline.status).toBe(200);
    expect(baseline.body.total).toBe(2);

    for (const q of ["%", "_"]) {
      const res = await request(app).get("/api/projects").query({ eventId, q });
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.items).toHaveLength(0);
    }
  });

  it("finds projects when q matches literal title text", async () => {
    const { eventId } = await seedGalleryProjects();

    const res = await request(app)
      .get("/api/projects")
      .query({ eventId, q: "Solar" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].title).toBe("Solar Panel Optimizer");
  });
});
