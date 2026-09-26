export type NormalizationCriterion = {
  id: string;
  key: string;
  weight: number;
  minScore: number;
  maxScore: number;
};

export type NormalizationScore = {
  criterionKey: string;
  value: number;
};

export type NormalizationReview = {
  assignmentId: string;
  judgeId: string;
  projectId: string;
  scores: NormalizationScore[];
};

export type NormalizationProject = {
  id: string;
  trackId: string | null;
  title: string;
  duplicateOfId: string | null;
};

export type NormalizationInput = {
  criteria: NormalizationCriterion[];
  reviews: NormalizationReview[];
  projects: NormalizationProject[];
  reviewsPerProject: number;
};

export type ReviewNormalization = {
  assignmentId: string;
  judgeId: string;
  projectId: string;
  total: number;
  normalized: number;
  z: number;
  partial: boolean;
};

export type ProjectResult = {
  id: string;
  trackId: string | null;
  title: string;
  rawScore: number | null;
  normalizedScore: number | null;
  reviewCount: number;
  rank: number | null;
  flags: Array<"under_reviewed" | "duplicate">;
  excludedFromRanking: boolean;
  criterionAverages: Record<string, number | null>;
};

export type NormalizationOutput = {
  reviews: ReviewNormalization[];
  projects: ProjectResult[];
  flatScorerJudgeIds: string[];
  lowSampleJudgeIds: string[];
  rubricMin: number;
  rubricMax: number;
};

function populationStdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeWeightedTotal(
  scores: NormalizationScore[],
  criteria: NormalizationCriterion[],
): { total: number; partial: boolean; weightSum: number } {
  const byKey = new Map(criteria.map((criterion) => [criterion.key, criterion]));
  let weighted = 0;
  let weightSum = 0;
  let present = 0;
  for (const score of scores) {
    const criterion = byKey.get(score.criterionKey);
    if (!criterion) continue;
    weighted += score.value * criterion.weight;
    weightSum += criterion.weight;
    present += 1;
  }
  const partial = present < criteria.length || present === 0;
  if (weightSum === 0) {
    return { total: 0, partial: true, weightSum: 0 };
  }
  return { total: weighted / weightSum, partial, weightSum };
}

export function normalizeScores(input: NormalizationInput): NormalizationOutput {
  const { criteria, reviews, projects, reviewsPerProject } = input;
  const rubricMin =
    criteria.length > 0 ? Math.min(...criteria.map((criterion) => criterion.minScore)) : 1;
  const rubricMax =
    criteria.length > 0 ? Math.max(...criteria.map((criterion) => criterion.maxScore)) : 5;

  if (reviews.length === 0) {
    return {
      reviews: [],
      projects: projects.map((project) => ({
        id: project.id,
        trackId: project.trackId,
        title: project.title,
        rawScore: null,
        normalizedScore: null,
        reviewCount: 0,
        rank: null,
        flags: [
          ...(project.duplicateOfId ? (["duplicate"] as const) : []),
          ...(["under_reviewed"] as const),
        ].filter((flag, index, arr) => arr.indexOf(flag) === index) as Array<
          "under_reviewed" | "duplicate"
        >,
        excludedFromRanking: Boolean(project.duplicateOfId),
        criterionAverages: Object.fromEntries(criteria.map((criterion) => [criterion.key, null])),
      })),
      flatScorerJudgeIds: [],
      lowSampleJudgeIds: [],
      rubricMin,
      rubricMax,
    };
  }

  const reviewTotals = reviews.map((review) => {
    const { total, partial } = computeWeightedTotal(review.scores, criteria);
    return { review, total, partial };
  });

  const allTotals = reviewTotals.map((row) => row.total);
  const muGlobal = mean(allTotals);
  const sigmaGlobal = populationStdDev(allTotals, muGlobal);

  const byJudge = new Map<string, number[]>();
  for (const row of reviewTotals) {
    const list = byJudge.get(row.review.judgeId) ?? [];
    list.push(row.total);
    byJudge.set(row.review.judgeId, list);
  }

  const flatScorerJudgeIds: string[] = [];
  const lowSampleJudgeIds: string[] = [];
  const judgeStats = new Map<string, { mu: number; sigma: number; n: number }>();

  for (const [judgeId, totals] of byJudge) {
    const mu = mean(totals);
    const sigma = populationStdDev(totals, mu);
    const n = totals.length;
    judgeStats.set(judgeId, { mu, sigma, n });
    if (sigma === 0 && n > 0) flatScorerJudgeIds.push(judgeId);
    if (n < 3) lowSampleJudgeIds.push(judgeId);
  }

  const normalizedReviews: ReviewNormalization[] = reviewTotals.map((row) => {
    const stats = judgeStats.get(row.review.judgeId) ?? { mu: muGlobal, sigma: 0, n: 0 };
    let z = 0;
    if (stats.sigma === 0) {
      z = 0;
    } else if (stats.n < 3) {
      z = sigmaGlobal === 0 ? 0 : (row.total - muGlobal) / sigmaGlobal;
    } else {
      z = (row.total - stats.mu) / stats.sigma;
    }
    const normalized = clamp(muGlobal + z * sigmaGlobal, rubricMin, rubricMax);
    return {
      assignmentId: row.review.assignmentId,
      judgeId: row.review.judgeId,
      projectId: row.review.projectId,
      total: row.total,
      normalized,
      z,
      partial: row.partial,
    };
  });

  const reviewsByProject = new Map<string, ReviewNormalization[]>();
  for (const review of normalizedReviews) {
    const list = reviewsByProject.get(review.projectId) ?? [];
    list.push(review);
    reviewsByProject.set(review.projectId, list);
  }

  const underReviewedThreshold = Math.min(2, reviewsPerProject);

  const projectResults: ProjectResult[] = projects.map((project) => {
    const projectReviews = reviewsByProject.get(project.id) ?? [];
    const reviewCount = projectReviews.length;
    const flags: Array<"under_reviewed" | "duplicate"> = [];
    if (project.duplicateOfId) flags.push("duplicate");
    if (reviewCount < underReviewedThreshold) flags.push("under_reviewed");

    const criterionAverages: Record<string, number | null> = {};
    for (const criterion of criteria) {
      const values: number[] = [];
      for (const review of reviews) {
        if (review.projectId !== project.id) continue;
        const score = review.scores.find((entry) => entry.criterionKey === criterion.key);
        if (score) values.push(score.value);
      }
      criterionAverages[criterion.key] = values.length > 0 ? mean(values) : null;
    }

    return {
      id: project.id,
      trackId: project.trackId,
      title: project.title,
      rawScore: reviewCount > 0 ? mean(projectReviews.map((review) => review.total)) : null,
      normalizedScore:
        reviewCount > 0 ? mean(projectReviews.map((review) => review.normalized)) : null,
      reviewCount,
      rank: null,
      flags,
      excludedFromRanking: Boolean(project.duplicateOfId),
      criterionAverages,
    };
  });

  const byTrack = new Map<string | null, ProjectResult[]>();
  for (const project of projectResults) {
    const list = byTrack.get(project.trackId) ?? [];
    list.push(project);
    byTrack.set(project.trackId, list);
  }

  for (const trackProjects of byTrack.values()) {
    const rankable = trackProjects
      .filter((project) => !project.excludedFromRanking)
      .sort((a, b) => {
        if (a.reviewCount === 0 && b.reviewCount === 0) return a.id.localeCompare(b.id);
        if (a.reviewCount === 0) return 1;
        if (b.reviewCount === 0) return -1;
        const normalizedDiff = (b.normalizedScore ?? 0) - (a.normalizedScore ?? 0);
        if (normalizedDiff !== 0) return normalizedDiff;
        const rawDiff = (b.rawScore ?? 0) - (a.rawScore ?? 0);
        if (rawDiff !== 0) return rawDiff;
        const countDiff = b.reviewCount - a.reviewCount;
        if (countDiff !== 0) return countDiff;
        return a.id.localeCompare(b.id);
      });

    let rank = 1;
    for (const project of rankable) {
      if (project.reviewCount === 0) {
        project.rank = null;
        continue;
      }
      project.rank = rank;
      rank += 1;
    }
  }

  return {
    reviews: normalizedReviews,
    projects: projectResults,
    flatScorerJudgeIds,
    lowSampleJudgeIds,
    rubricMin,
    rubricMax,
  };
}

export function roundDisplay(value: number | null, digits = 2): number | null {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
