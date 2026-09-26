import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { getTestApp, resetDatabase, createUser } from "../helpers/index.js";
import { PlatformRole } from "@prisma/client";
import { prisma } from "../../src/server/src/lib/prisma.js";

describe("api/teams", () => {
  const app = getTestApp();

  beforeEach(async () => {
    await resetDatabase();
  });

  it("prevents concurrent joins exceeding max team size", async () => {
    const org = await createUser({ email: "org@test.com", name: "Org", platformRole: PlatformRole.ORGANIZER });
    
    // Max team size is 2
    const eventRes = await request(app)
      .post("/api/events")
      .set("Authorization", `Bearer ${org.token}`)
      .send({
        name: "Test Event",
        submissionsOpen: "2026-06-01T00:00:00.000Z",
        submissionsClose: "2030-06-20T00:00:00.000Z",
        maxTeamSize: 2,
        reviewsPerProject: 2,
        tracks: [],
        prizes: [],
      });
    const eventId = eventRes.body.event.id;

    await prisma.event.update({ where: { id: eventId }, data: { publishedAt: new Date() } });

    const user1 = await createUser({ email: "u1@test.com", name: "U1" });
    const teamRes = await request(app)
      .post(`/api/events/${eventId}/teams`)
      .set("Authorization", `Bearer ${user1.token}`)
      .send({ name: "My Team" });
    const inviteCode = teamRes.body.team.inviteCode;

    // Create 3 concurrent users
    const joiners = await Promise.all([
      createUser({ email: "u2@test.com", name: "U2" }),
      createUser({ email: "u3@test.com", name: "U3" }),
      createUser({ email: "u4@test.com", name: "U4" }),
    ]);

    // Send joins concurrently
    const responses = await Promise.all(
      joiners.map(j =>
        request(app)
          .post(`/api/teams/invite/${inviteCode}/join`)
          .set("Authorization", `Bearer ${j.token}`)
      )
    );

    const successes = responses.filter(r => r.status === 200).length;
    const teamFulls = responses.filter(r => r.status === 409 && r.body.error.code === "team_full").length;
    
    // Team max size is 2. 1 slot is already taken. Only 1 join should succeed.
    expect(successes).toBe(1);
    expect(teamFulls).toBe(2);
  });
});
