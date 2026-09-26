import { describe, expect, it } from "vitest";
import {
  normalizeScores,
  type NormalizationInput,
} from "../../src/server/src/modules/judging/normalization";

const criteria = [
  { id: "c1", key: "quality", weight: 50, minScore: 1, maxScore: 5 },
  { id: "c2", key: "impact", weight: 50, minScore: 1, maxScore: 5 },
];

function baseInput(overrides: Partial<NormalizationInput> = {}): NormalizationInput {
  return {
    criteria,
    reviews: [],
    projects: [
      { id: "p1", trackId: "t1", title: "One", duplicateOfId: null },
      { id: "p2", trackId: "t1", title: "Two", duplicateOfId: null },
      { id: "p3", trackId: "t1", title: "Three", duplicateOfId: null },
    ],
    reviewsPerProject: 3,
    ...overrides,
  };
}

describe("normalizeScores", () => {
  it("flags flat scorers and sets z = 0", () => {
    const result = normalizeScores(
      baseInput({
        reviews: [
          {
            assignmentId: "a1",
            judgeId: "flat",
            projectId: "p1",
            scores: [
              { criterionKey: "quality", value: 4 },
              { criterionKey: "impact", value: 4 },
            ],
          },
          {
            assignmentId: "a2",
            judgeId: "flat",
            projectId: "p2",
            scores: [
              { criterionKey: "quality", value: 4 },
              { criterionKey: "impact", value: 4 },
            ],
          },
          {
            assignmentId: "a3",
            judgeId: "flat",
            projectId: "p3",
            scores: [
              { criterionKey: "quality", value: 4 },
              { criterionKey: "impact", value: 4 },
            ],
          },
        ],
      }),
    );
    expect(result.flatScorerJudgeIds).toContain("flat");
    expect(result.reviews.every((review) => review.z === 0)).toBe(true);
  });

  it("uses global stats when judge has fewer than 3 reviews", () => {
    const result = normalizeScores(
      baseInput({
        reviews: [
          {
            assignmentId: "a1",
            judgeId: "low",
            projectId: "p1",
            scores: [
              { criterionKey: "quality", value: 5 },
              { criterionKey: "impact", value: 5 },
            ],
          },
          {
            assignmentId: "a2",
            judgeId: "low",
            projectId: "p2",
            scores: [
              { criterionKey: "quality", value: 1 },
              { criterionKey: "impact", value: 1 },
            ],
          },
          {
            assignmentId: "a3",
            judgeId: "other",
            projectId: "p3",
            scores: [
              { criterionKey: "quality", value: 3 },
              { criterionKey: "impact", value: 3 },
            ],
          },
        ],
      }),
    );
    expect(result.lowSampleJudgeIds).toContain("low");
    const lowReviews = result.reviews.filter((review) => review.judgeId === "low");
    expect(lowReviews.length).toBe(2);
    expect(lowReviews[0]?.normalized).not.toBeUndefined();
  });

  it("handles uneven review counts", () => {
    const reviews = [];
    for (let i = 0; i < 2; i += 1) {
      reviews.push({
        assignmentId: `a-p1-${i}`,
        judgeId: `j${i}`,
        projectId: "p1",
        scores: [
          { criterionKey: "quality", value: 4 },
          { criterionKey: "impact", value: 4 },
        ],
      });
    }
    for (let i = 0; i < 5; i += 1) {
      reviews.push({
        assignmentId: `a-p2-${i}`,
        judgeId: `j${i}`,
        projectId: "p2",
        scores: [
          { criterionKey: "quality", value: 3 + (i % 2) },
          { criterionKey: "impact", value: 3 },
        ],
      });
    }
    const result = normalizeScores(baseInput({ reviews }));
    const p1 = result.projects.find((project) => project.id === "p1");
    const p2 = result.projects.find((project) => project.id === "p2");
    expect(p1?.reviewCount).toBe(2);
    expect(p2?.reviewCount).toBe(5);
  });

  it("changes totals when weights change", () => {
    const reviews = [
      {
        assignmentId: "a1",
        judgeId: "j1",
        projectId: "p1",
        scores: [
          { criterionKey: "quality", value: 5 },
          { criterionKey: "impact", value: 1 },
        ],
      },
    ];
    const equal = normalizeScores(baseInput({ reviews }));
    const skewed = normalizeScores(
      baseInput({
        reviews,
        criteria: [
          { id: "c1", key: "quality", weight: 90, minScore: 1, maxScore: 5 },
          { id: "c2", key: "impact", weight: 10, minScore: 1, maxScore: 5 },
        ],
      }),
    );
    expect(equal.reviews[0]?.total).toBe(3);
    expect(skewed.reviews[0]?.total).toBe(4.6);
  });

  it("clamps normalized values to rubric range", () => {
    const result = normalizeScores(
      baseInput({
        reviews: [
          {
            assignmentId: "a1",
            judgeId: "j1",
            projectId: "p1",
            scores: [
              { criterionKey: "quality", value: 1 },
              { criterionKey: "impact", value: 1 },
            ],
          },
          {
            assignmentId: "a2",
            judgeId: "j1",
            projectId: "p2",
            scores: [
              { criterionKey: "quality", value: 5 },
              { criterionKey: "impact", value: 5 },
            ],
          },
          {
            assignmentId: "a3",
            judgeId: "j1",
            projectId: "p3",
            scores: [
              { criterionKey: "quality", value: 3 },
              { criterionKey: "impact", value: 3 },
            ],
          },
        ],
      }),
    );
    for (const review of result.reviews) {
      expect(review.normalized).toBeGreaterThanOrEqual(1);
      expect(review.normalized).toBeLessThanOrEqual(5);
    }
  });

  it("handles empty input", () => {
    const result = normalizeScores(
      baseInput({
        reviews: [],
        projects: [{ id: "p1", trackId: "t1", title: "One", duplicateOfId: null }],
      }),
    );
    expect(result.reviews).toHaveLength(0);
    expect(result.projects[0]?.reviewCount).toBe(0);
    expect(result.projects[0]?.rank).toBeNull();
  });
});
