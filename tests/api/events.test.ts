import { describe, expect, it, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { PlatformRole } from "@prisma/client";
import {
  authHeader,
  clearFixedClock,
  createUser,
  getTestApp,
  resetDatabase,
} from "../helpers/index.js";

describe("api/events", () => {
  const app = getTestApp();

  beforeEach(async () => {
    await resetDatabase();
    clearFixedClock();
  });

  afterEach(() => {
    clearFixedClock();
  });

  it("rejects malformed submissionsOpen datetime strings", async () => {
    const organizer = await createUser({
      email: "bad-date@test.local",
      name: "Org",
      platformRole: PlatformRole.ORGANIZER,
    });

    for (const submissionsOpen of ["1", "soon"]) {
      const res = await request(app)
        .post("/api/events")
        .set(authHeader(organizer.token))
        .send({
          name: "Bad Date Event",
          submissionsOpen,
          submissionsClose: "2026-06-20T00:00:00.000Z",
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("bad_request");
    }
  });

  it("rejects event creation with votingClose before votingOpen", async () => {
    const organizer = await createUser({
      email: "org@test.local",
      name: "Org",
      platformRole: PlatformRole.ORGANIZER,
    });

    const res = await request(app)
      .post("/api/events")
      .set(authHeader(organizer.token))
      .send({
        name: "Test Event",
        submissionsOpen: "2026-06-01T00:00:00.000Z",
        submissionsClose: "2026-06-20T00:00:00.000Z",
        votingOpen: "2026-07-01T00:00:00.000Z",
        votingClose: "2026-06-25T00:00:00.000Z", // before votingOpen
      });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("votingOpen must be before votingClose");
  });

  it("rejects event creation with votingOpen before submissionsClose", async () => {
    const organizer = await createUser({
      email: "org@test.local",
      name: "Org",
      platformRole: PlatformRole.ORGANIZER,
    });

    const res = await request(app)
      .post("/api/events")
      .set(authHeader(organizer.token))
      .send({
        name: "Test Event",
        submissionsOpen: "2026-06-01T00:00:00.000Z",
        submissionsClose: "2026-06-20T00:00:00.000Z",
        votingOpen: "2026-06-15T00:00:00.000Z", // before submissionsClose
        votingClose: "2026-07-01T00:00:00.000Z",
      });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("votingOpen must be on or after submissionsClose");
  });

  it("rejects event creation if only one of votingOpen or votingClose is provided", async () => {
    const organizer = await createUser({
      email: "org@test.local",
      name: "Org",
      platformRole: PlatformRole.ORGANIZER,
    });

    const res = await request(app)
      .post("/api/events")
      .set(authHeader(organizer.token))
      .send({
        name: "Test Event",
        submissionsOpen: "2026-06-01T00:00:00.000Z",
        submissionsClose: "2026-06-20T00:00:00.000Z",
        votingOpen: "2026-07-01T00:00:00.000Z",
      });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("votingOpen and votingClose must both be provided or both be omitted");
  });
});
