import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  });
});
