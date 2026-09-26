import { describe, expect, it } from "vitest";
import {
  judgingOpen,
  phase,
  submissionsOpen,
  type EventPhaseFields,
} from "../../src/server/src/modules/events/phase";

function event(overrides: Partial<EventPhaseFields> = {}): EventPhaseFields {
  return {
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    submissionsOpen: new Date("2026-02-01T00:00:00.000Z"),
    submissionsClose: new Date("2026-03-01T00:00:00.000Z"),
    judgingClose: null,
    resultsPublishedAt: null,
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
});
