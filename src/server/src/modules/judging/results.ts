import {
  normalizeScores,
  roundDisplay,
  type NormalizationInput,
} from "./normalization.js";

export function buildNormalizationInput(data: {
  criteria: Array<{
    id: string;
    key: string;
    weight: number;
    minScore: number;
    maxScore: number;
  }>;
  assignments: Array<{
    id: string;
    judgeId: string;
    projectId: string;
    status: string;
    scores: Array<{ criterion: { key: string }; value: number }>;
  }>;
  projects: Array<{
    id: string;
    trackId: string | null;
    title: string;
    duplicateOfId: string | null;
  }>;
  reviewsPerProject: number;
}): NormalizationInput {
  return {
    criteria: data.criteria.map((criterion) => ({
      id: criterion.id,
      key: criterion.key,
      weight: criterion.weight,
      minScore: criterion.minScore,
      maxScore: criterion.maxScore,
    })),
    reviews: data.assignments
      .filter((assignment) => assignment.status === "SUBMITTED")
      .map((assignment) => ({
        assignmentId: assignment.id,
        judgeId: assignment.judgeId,
        projectId: assignment.projectId,
        scores: assignment.scores.map((score) => ({
          criterionKey: score.criterion.key,
          value: score.value,
        })),
      })),
    projects: data.projects,
    reviewsPerProject: data.reviewsPerProject,
  };
}

export function organizerResultsView(
  input: ReturnType<typeof normalizeScores>,
  extras: {
    tracks: Array<{ id: string; name: string }>;
    projects: Array<{ id: string; teamName: string }>;
  },
) {
  const trackName = new Map(extras.tracks.map((track) => [track.id, track.name]));
  const teamName = new Map(extras.projects.map((project) => [project.id, project.teamName]));

  const byTrack = new Map<string, typeof input.projects>();
  for (const project of input.projects) {
    const key = project.trackId ?? "_none";
    const list = byTrack.get(key) ?? [];
    list.push(project);
    byTrack.set(key, list);
  }

  const tracks = [...byTrack.entries()].map(([trackId, projects]) => {
    const sorted = [...projects].sort((a, b) => {
      if (a.rank === null && b.rank === null) return a.id.localeCompare(b.id);
      if (a.rank === null) return 1;
      if (b.rank === null) return -1;
      return (a.rank ?? 0) - (b.rank ?? 0);
    });
    return {
      trackId: trackId === "_none" ? null : trackId,
      trackName: trackId === "_none" ? null : (trackName.get(trackId) ?? null),
      projects: sorted.map((project) => ({
        id: project.id,
        title: project.title,
        teamName: teamName.get(project.id) ?? null,
        rank: project.rank,
        reviewCount: project.reviewCount,
        rawScore: roundDisplay(project.rawScore),
        normalizedScore: roundDisplay(project.normalizedScore),
        flags: project.flags,
        criterionAverages: Object.fromEntries(
          Object.entries(project.criterionAverages).map(([key, value]) => [
            key,
            roundDisplay(value),
          ]),
        ),
      })),
    };
  });

  return {
    tracks,
    flatScorerJudgeIds: input.flatScorerJudgeIds,
    lowSampleJudgeIds: input.lowSampleJudgeIds,
  };
}

export function publicResultsView(
  input: ReturnType<typeof normalizeScores>,
  extras: {
    tracks: Array<{ id: string; name: string }>;
    projects: Array<{ id: string; teamName: string }>;
  },
) {
  const organizer = organizerResultsView(input, extras);
  return {
    tracks: organizer.tracks.map((track) => ({
      trackId: track.trackId,
      trackName: track.trackName,
      projects: track.projects
        .filter((project) => !project.flags.includes("duplicate"))
        .map((project) => ({
          id: project.id,
          title: project.title,
          teamName: project.teamName,
          rank: project.rank,
          reviewCount: project.reviewCount,
          rawScore: project.rawScore,
          normalizedScore: project.normalizedScore,
        })),
    })),
  };
}
