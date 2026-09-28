import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { AssignmentStatus } from "@prisma/client";
import { prisma } from "../../src/server/src/lib/prisma.js";
import {
  authHeader,
  clearFixedClock,
  getTestApp,
  resetDatabase,
  seedPermissionScenario,
} from "../helpers/index.js";

describe("api/judging-edge", () => {
  const app = getTestApp();

  beforeEach(async () => {
    await resetDatabase();
    clearFixedClock();
  });

  it("dashboard percentComplete uses target coverage (projects × reviewsPerProject)", async () => {
    const scenario = await seedPermissionScenario("-dash");

    const beforeSubmit = await request(app)
      .get(`/api/events/${scenario.eventId}/dashboard`)
      .set(authHeader(scenario.organizer.token));
    expect(beforeSubmit.status).toBe(200);
    expect(beforeSubmit.body.totals.targetCoverage).toBe(2);
    expect(beforeSubmit.body.totals.submitted).toBe(0);
    expect(beforeSubmit.body.totals.percentComplete).toBe(0);

    await prisma.assignment.update({
      where: { id: scenario.assignmentAId },
      data: { status: AssignmentStatus.SUBMITTED, submittedAt: scenario.now },
    });

    const afterOne = await request(app)
      .get(`/api/events/${scenario.eventId}/dashboard`)
      .set(authHeader(scenario.organizer.token));
    expect(afterOne.status).toBe(200);
    expect(afterOne.body.totals.percentComplete).toBe(50);
    expect(
      afterOne.body.flags.some(
        (flag: { type: string; targetId: string }) =>
          flag.type === "below_target" && flag.targetId === scenario.projectId,
      ),
    ).toBe(true);
  });
});
