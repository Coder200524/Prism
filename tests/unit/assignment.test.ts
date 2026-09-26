import { describe, expect, it } from "vitest";
import { assignReviews } from "../../src/server/src/modules/judging/assignment";

describe("assignReviews", () => {
  const judges = [
    { id: "j1", email: "j1@example.com", trackIds: ["t1"] },
    { id: "j2", email: "j2@example.com", trackIds: ["t2"] },
    { id: "j3", email: "j3@example.com", trackIds: ["t1", "t2"] },
  ];

  it("never assigns a team member", () => {
    const result = assignReviews({
      projects: [
        {
          id: "p1",
          trackId: "t1",
          teamMemberUserIds: ["j1"],
          teamMemberEmails: ["j1@example.com"],
        },
      ],
      judges,
      existing: [],
      reviewsPerProject: 2,
    });
    expect(result.created.every((row) => row.judgeId !== "j1")).toBe(true);
  });

  it("respects K reviews per project", () => {
    const result = assignReviews({
      projects: [
        {
          id: "p1",
          trackId: "t1",
          teamMemberUserIds: [],
          teamMemberEmails: [],
        },
      ],
      judges,
      existing: [],
      reviewsPerProject: 2,
    });
    expect(result.created.filter((row) => row.projectId === "p1")).toHaveLength(2);
  });

  it("balances load so max-min <= 1 when possible", () => {
    const projects = ["p1", "p2", "p3"].map((id) => ({
      id,
      trackId: "t1" as string | null,
      teamMemberUserIds: [] as string[],
      teamMemberEmails: [] as string[],
    }));
    const result = assignReviews({
      projects,
      judges,
      existing: [],
      reviewsPerProject: 2,
    });
    const loads = new Map<string, number>();
    for (const row of result.created) {
      loads.set(row.judgeId, (loads.get(row.judgeId) ?? 0) + 1);
    }
    const values = [...loads.values()];
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });

  it("prefers track judges and falls back when needed", () => {
    const result = assignReviews({
      projects: [
        {
          id: "p1",
          trackId: "t1",
          teamMemberUserIds: [],
          teamMemberEmails: [],
        },
      ],
      judges: [
        { id: "only-t2", email: "t2@example.com", trackIds: ["t2"] },
        { id: "t1-judge", email: "t1@example.com", trackIds: ["t1"] },
      ],
      existing: [],
      reviewsPerProject: 2,
    });
    const preferred = result.created.find((row) => row.judgeId === "t1-judge");
    const fallback = result.created.find((row) => row.judgeId === "only-t2");
    expect(preferred?.trackFallback).toBe(false);
    expect(fallback?.trackFallback).toBe(true);
  });

  it("is idempotent when existing assignments fill K", () => {
    const first = assignReviews({
      projects: [
        {
          id: "p1",
          trackId: "t1",
          teamMemberUserIds: [],
          teamMemberEmails: [],
        },
      ],
      judges,
      existing: [],
      reviewsPerProject: 2,
    });
    const second = assignReviews({
      projects: [
        {
          id: "p1",
          trackId: "t1",
          teamMemberUserIds: [],
          teamMemberEmails: [],
        },
      ],
      judges,
      existing: first.created.map((row) => ({
        judgeId: row.judgeId,
        projectId: row.projectId,
      })),
      reviewsPerProject: 2,
    });
    expect(second.created).toHaveLength(0);
  });

  it("is deterministic", () => {
    const input = {
      projects: [
        {
          id: "p1",
          trackId: "t1" as string | null,
          teamMemberUserIds: [] as string[],
          teamMemberEmails: [] as string[],
        },
        {
          id: "p2",
          trackId: "t2" as string | null,
          teamMemberUserIds: [] as string[],
          teamMemberEmails: [] as string[],
        },
      ],
      judges,
      existing: [],
      reviewsPerProject: 2,
    };
    const a = assignReviews(input);
    const b = assignReviews(input);
    expect(a).toEqual(b);
  });
});
