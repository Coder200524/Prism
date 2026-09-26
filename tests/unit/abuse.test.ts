import { describe, it, expect } from "vitest";
import { checkAbuse, ABUSE_THRESHOLDS } from "../../src/server/src/modules/community/abuse.js";

describe("unit/abuse", () => {
  it("flags new_account if voterCreatedAt > eventVotingOpen", () => {
    const res = checkAbuse({
      voterCreatedAt: new Date("2026-09-02T00:00:00Z"),
      eventVotingOpen: new Date("2026-09-01T00:00:00Z"),
      ipVoterCountInWindow: 1,
      voterVoteTimes: [],
      totalTracksInEvent: 3,
    });
    expect(res.flagged).toBe(true);
    expect(res.reasons).toContain("new_account");
  });

  it("does not flag new_account if voterCreatedAt <= eventVotingOpen", () => {
    const res = checkAbuse({
      voterCreatedAt: new Date("2026-08-01T00:00:00Z"),
      eventVotingOpen: new Date("2026-09-01T00:00:00Z"),
      ipVoterCountInWindow: 1,
      voterVoteTimes: [],
      totalTracksInEvent: 3,
    });
    expect(res.flagged).toBe(false);
  });

  it("flags shared_ip_burst if ipVoterCountInWindow > 3", () => {
    const res = checkAbuse({
      voterCreatedAt: new Date("2026-08-01T00:00:00Z"),
      eventVotingOpen: new Date("2026-09-01T00:00:00Z"),
      ipVoterCountInWindow: 4,
      voterVoteTimes: [],
      totalTracksInEvent: 3,
    });
    expect(res.flagged).toBe(true);
    expect(res.reasons).toContain("shared_ip_burst");
  });

  it("flags rapid_voting if votes cast in all tracks within 10 seconds", () => {
    const t0 = new Date("2026-09-01T10:00:00Z").getTime();
    const res = checkAbuse({
      voterCreatedAt: new Date("2026-08-01T00:00:00Z"),
      eventVotingOpen: new Date("2026-09-01T00:00:00Z"),
      ipVoterCountInWindow: 1,
      voterVoteTimes: [
        new Date(t0),
        new Date(t0 + 2000), // +2s
        new Date(t0 + 9000), // +9s
      ],
      totalTracksInEvent: 3,
    });
    expect(res.flagged).toBe(true);
    expect(res.reasons).toContain("rapid_voting");
  });

  it("does not flag rapid_voting if time span > 10 seconds", () => {
    const t0 = new Date("2026-09-01T10:00:00Z").getTime();
    const res = checkAbuse({
      voterCreatedAt: new Date("2026-08-01T00:00:00Z"),
      eventVotingOpen: new Date("2026-09-01T00:00:00Z"),
      ipVoterCountInWindow: 1,
      voterVoteTimes: [
        new Date(t0),
        new Date(t0 + 2000),
        new Date(t0 + 11000), // +11s
      ],
      totalTracksInEvent: 3,
    });
    expect(res.flagged).toBe(false);
  });
  
  it("does not flag rapid_voting if missing votes for some tracks", () => {
    const t0 = new Date("2026-09-01T10:00:00Z").getTime();
    const res = checkAbuse({
      voterCreatedAt: new Date("2026-08-01T00:00:00Z"),
      eventVotingOpen: new Date("2026-09-01T00:00:00Z"),
      ipVoterCountInWindow: 1,
      voterVoteTimes: [
        new Date(t0),
        new Date(t0 + 2000),
      ],
      totalTracksInEvent: 3, // only 2 votes cast
    });
    expect(res.flagged).toBe(false);
  });
});
