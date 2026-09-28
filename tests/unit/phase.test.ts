import { describe, expect, it } from "vitest";
import {
  judgingOpen,
  phase,
  submissionsOpen,
  votingEnabled,
  votingOpen,
  votingClosed,
  type EventPhaseFields,
} from "../../src/server/src/modules/events/phase";

function event(overrides: Partial<EventPhaseFields> = {}): EventPhaseFields {
  return {
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    submissionsOpen: new Date("2026-02-01T00:00:00.000Z"),
    submissionsClose: new Date("2026-03-01T00:00:00.000Z"),
    judgingClose: null,
    resultsPublishedAt: null,
    votingOpen: null,
    votingClose: null,
    ...overrides,
  };
}

describe("phase helpers", () => {
  it("computes phases across the timeline", () => {
    const e = event();
    expect(phase({ ...e, publishedAt: null }, new Date("2026-02-15"))).toBe("draft");
    expect(phase(e, new Date("2026-01-15"))).toBe("upcoming");
    expect(phase(e, new Date("2026-02-15"))).toBe("submissions");
    expect(phase(e, new Date("2026-03-15"))).toBe("judging");
    expect(
      phase({ ...e, resultsPublishedAt: new Date("2026-04-01") }, new Date("2026-04-02")),
    ).toBe("results");
  });

  it("opens submissions only inside the window", () => {
    const e = event();
    expect(submissionsOpen(e, new Date("2026-01-15"))).toBe(false);
    expect(submissionsOpen(e, new Date("2026-02-15"))).toBe(true);
    expect(submissionsOpen(e, new Date("2026-03-01"))).toBe(false);
  });

  it("opens judging after submissions close until results publish", () => {
    const e = event();
    expect(judgingOpen(e, new Date("2026-02-15"))).toBe(false);
    expect(judgingOpen(e, new Date("2026-03-15"))).toBe(true);
    expect(
      judgingOpen({ ...e, resultsPublishedAt: new Date("2026-04-01") }, new Date("2026-04-02")),
    ).toBe(false);
    expect(
      judgingOpen(
        { ...e, judgingClose: new Date("2026-03-10") },
        new Date("2026-03-15"),
      ),
    ).toBe(false);
  });

  it("returns closed when judging ended and results are not published", () => {
    const e = event({ judgingClose: new Date("2026-03-10T00:00:00.000Z") });
    expect(phase(e, new Date("2026-03-09T23:59:59.999Z"))).toBe("judging");
    expect(phase(e, new Date("2026-03-10T00:00:00.000Z"))).toBe("closed");
    expect(phase(e, new Date("2026-04-01T00:00:00.000Z"))).toBe("closed");
  });

  it("uses exclusive end boundary for submissions window", () => {
    const e = event();
    expect(submissionsOpen(e, new Date("2026-02-01T00:00:00.000Z"))).toBe(true);
    expect(submissionsOpen(e, new Date("2026-03-01T00:00:00.000Z"))).toBe(false);
    expect(phase(e, new Date("2026-02-28T23:59:59.999Z"))).toBe("submissions");
    expect(phase(e, new Date("2026-03-01T00:00:00.000Z"))).toBe("judging");
  });

  it("prefers results phase over closed when results are published", () => {
    const e = event({
      judgingClose: new Date("2026-03-10T00:00:00.000Z"),
      resultsPublishedAt: new Date("2026-03-15T00:00:00.000Z"),
    });
    expect(phase(e, new Date("2026-03-20T00:00:00.000Z"))).toBe("results");
    expect(judgingOpen(e, new Date("2026-03-12T00:00:00.000Z"))).toBe(false);
  });

  it("correctly identifies voting windows", () => {
    const withoutVoting = event();
    expect(votingEnabled(withoutVoting)).toBe(false);
    expect(votingOpen(withoutVoting, new Date("2026-04-15"))).toBe(false);
    expect(votingClosed(withoutVoting, new Date("2026-04-15"))).toBe(false);

    const withVoting = event({
      votingOpen: new Date("2026-04-01T00:00:00.000Z"),
      votingClose: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(votingEnabled(withVoting)).toBe(true);
    
    // exact boundaries
    expect(votingOpen(withVoting, new Date("2026-03-31T23:59:59.999Z"))).toBe(false);
    expect(votingOpen(withVoting, new Date("2026-04-01T00:00:00.000Z"))).toBe(true);
    expect(votingOpen(withVoting, new Date("2026-04-15T00:00:00.000Z"))).toBe(true);
    expect(votingOpen(withVoting, new Date("2026-05-01T00:00:00.000Z"))).toBe(false);

    expect(votingClosed(withVoting, new Date("2026-04-30T23:59:59.999Z"))).toBe(false);
    expect(votingClosed(withVoting, new Date("2026-05-01T00:00:00.000Z"))).toBe(true);
    expect(votingClosed(withVoting, new Date("2026-06-01T00:00:00.000Z"))).toBe(true);
  });
});
