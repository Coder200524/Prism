import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlatformRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../../src/server/src/lib/prisma.js";
import { runSeed } from "../../src/server/src/seed/index.js";
import { clearFixedClock, resetDatabase, setFixedClock } from "../helpers/index.js";

async function counts() {
  const [users, events, tracks, teams, projects, assignments, criteria, scores] =
    await Promise.all([
      prisma.user.count(),
      prisma.event.count(),
      prisma.track.count(),
      prisma.team.count(),
      prisma.project.count(),
      prisma.assignment.count(),
      prisma.criterion.count(),
      prisma.criterionScore.count(),
    ]);
  return { users, events, tracks, teams, projects, assignments, criteria, scores };
}

describe("api/seed", () => {
  beforeEach(async () => {
    await resetDatabase();
    clearFixedClock();
    setFixedClock("2026-06-15T12:00:00.000Z");
  });

  afterEach(() => {
    clearFixedClock();
  });

  it("produces the same row counts when run twice", async () => {
    await runSeed({ seedDemo: true, publicUrl: "http://localhost:8080" });
    const first = await counts();

    await runSeed({ seedDemo: true, publicUrl: "http://localhost:8080" });
    const second = await counts();

    expect(second).toEqual(first);
    expect(first.events).toBeGreaterThan(0);
    expect(first.projects).toBeGreaterThan(0);
    expect(first.assignments).toBeGreaterThan(0);
  }, 120000);

  it("preserves edits to scores and rubric weights when run twice", async () => {
    await runSeed({ seedDemo: true, publicUrl: "http://localhost:8080" });

    // Find a criterion and change its weight
    const criterion = await prisma.criterion.findFirstOrThrow();
    await prisma.criterion.update({
      where: { id: criterion.id },
      data: { weight: 99 },
    });

    // Find a score and change its value
    const score = await prisma.criterionScore.findFirstOrThrow();
    await prisma.criterionScore.update({
      where: {
        assignmentId_criterionId: {
          assignmentId: score.assignmentId,
          criterionId: score.criterionId,
        },
      },
      data: { value: 999 },
    });

    // Run seed again
    await runSeed({ seedDemo: true, publicUrl: "http://localhost:8080" });

    // Check if edits are preserved
    const updatedCriterion = await prisma.criterion.findUniqueOrThrow({
      where: { id: criterion.id },
    });
    expect(updatedCriterion.weight).toBe(99);

    const updatedScore = await prisma.criterionScore.findUniqueOrThrow({
      where: {
        assignmentId_criterionId: {
          assignmentId: score.assignmentId,
          criterionId: score.criterionId,
        },
      },
    });
    expect(updatedScore.value).toBe(999);
  }, 120000);

  it("preserves organizer duplicate decisions across re-seed", async () => {
    await runSeed({ seedDemo: true, publicUrl: "http://localhost:8080" });

    const project = await prisma.project.findFirstOrThrow({
      where: { eventId: "evt_01", duplicateOfId: { not: null } },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: { duplicateOfId: null, duplicateCleared: true },
    });

    await runSeed({ seedDemo: true, publicUrl: "http://localhost:8080" });

    const after = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(after.duplicateCleared).toBe(true);
    expect(after.duplicateOfId).toBeNull();
  }, 120000);

  it("preserves project title edits across re-seed", async () => {
    await runSeed({ seedDemo: true, publicUrl: "http://localhost:8080" });

    const project = await prisma.project.findFirstOrThrow({ where: { eventId: "evt_01" } });
    await prisma.project.update({
      where: { id: project.id },
      data: { title: "Organizer Edited Title", summary: "Edited summary" },
    });

    await runSeed({ seedDemo: true, publicUrl: "http://localhost:8080" });

    const after = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(after.title).toBe("Organizer Edited Title");
    expect(after.summary).toBe("Edited summary");
  }, 120000);

  it("preserves user name, password, and platformRole across re-seed", async () => {
    await runSeed({ seedDemo: true, publicUrl: "http://localhost:8080" });

    const organizer = await prisma.user.findUniqueOrThrow({
      where: { email: "organizer@dogfood.local" },
    });
    const customHash = await bcrypt.hash("custom-organizer-password", 4);
    await prisma.user.update({
      where: { id: organizer.id },
      data: {
        name: "Renamed Organizer",
        passwordHash: customHash,
        platformRole: PlatformRole.USER,
      },
    });

    await runSeed({ seedDemo: true, publicUrl: "http://localhost:8080" });

    const after = await prisma.user.findUniqueOrThrow({
      where: { email: "organizer@dogfood.local" },
    });
    expect(after.name).toBe("Renamed Organizer");
    expect(after.passwordHash).toBe(customHash);
    expect(after.platformRole).toBe(PlatformRole.USER);

    // Missing bootstrap users are still created.
    await prisma.eventRole.deleteMany({ where: { user: { email: "voter5@dogfood.local" } } });
    await prisma.user.delete({ where: { email: "voter5@dogfood.local" } });
    await runSeed({ seedDemo: true, publicUrl: "http://localhost:8080" });
    const recreated = await prisma.user.findUnique({
      where: { email: "voter5@dogfood.local" },
    });
    expect(recreated).not.toBeNull();
    expect(recreated!.name.length).toBeGreaterThan(0);
  }, 120000);
});
