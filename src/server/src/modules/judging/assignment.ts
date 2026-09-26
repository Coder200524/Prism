import { createHash } from "node:crypto";

export type AssignmentProject = {
  id: string;
  trackId: string | null;
  teamMemberUserIds: string[];
  teamMemberEmails: string[];
};

export type AssignmentJudge = {
  id: string;
  email: string;
  trackIds: string[];
};

export type ExistingAssignment = {
  judgeId: string;
  projectId: string;
};

export type NewAssignment = {
  judgeId: string;
  projectId: string;
  trackFallback: boolean;
};

export type Unassignable = {
  projectId: string;
  reason: string;
};

export type AssignmentResult = {
  created: NewAssignment[];
  unassignable: Unassignable[];
};

function stableTieBreak(projectId: string, judgeId: string): number {
  const digest = createHash("sha256").update(`${projectId}\0${judgeId}`).digest();
  return digest.readUInt32BE(0);
}

function isConflictOfInterest(
  judge: AssignmentJudge,
  project: AssignmentProject,
): boolean {
  if (project.teamMemberUserIds.includes(judge.id)) return true;
  const email = judge.email.toLowerCase();
  return project.teamMemberEmails.some((memberEmail) => memberEmail.toLowerCase() === email);
}

export function assignReviews(input: {
  projects: AssignmentProject[];
  judges: AssignmentJudge[];
  existing: ExistingAssignment[];
  reviewsPerProject: number;
}): AssignmentResult {
  const { projects, judges, existing, reviewsPerProject: k } = input;
  const created: NewAssignment[] = [];
  const unassignable: Unassignable[] = [];

  const assignmentCounts = new Map<string, number>();
  const judgeLoads = new Map<string, number>();
  const assignedPairs = new Set<string>();

  for (const project of projects) {
    assignmentCounts.set(project.id, 0);
  }
  for (const judge of judges) {
    judgeLoads.set(judge.id, 0);
  }

  for (const row of existing) {
    assignedPairs.add(`${row.judgeId}:${row.projectId}`);
    assignmentCounts.set(row.projectId, (assignmentCounts.get(row.projectId) ?? 0) + 1);
    judgeLoads.set(row.judgeId, (judgeLoads.get(row.judgeId) ?? 0) + 1);
  }

  const orderedProjects = [...projects].sort((a, b) => {
    const countDiff = (assignmentCounts.get(a.id) ?? 0) - (assignmentCounts.get(b.id) ?? 0);
    if (countDiff !== 0) return countDiff;
    return a.id.localeCompare(b.id);
  });

  for (const project of orderedProjects) {
    while ((assignmentCounts.get(project.id) ?? 0) < k) {
      const eligible = judges.filter((judge) => {
        if (isConflictOfInterest(judge, project)) return false;
        if (assignedPairs.has(`${judge.id}:${project.id}`)) return false;
        return true;
      });

      if (eligible.length === 0) {
        unassignable.push({
          projectId: project.id,
          reason: "no_eligible_judges",
        });
        break;
      }

      const preferred = eligible.filter(
        (judge) => project.trackId !== null && judge.trackIds.includes(project.trackId),
      );
      const pool = preferred.length > 0 ? preferred : eligible;
      const trackFallback = preferred.length === 0;

      pool.sort((a, b) => {
        const loadDiff = (judgeLoads.get(a.id) ?? 0) - (judgeLoads.get(b.id) ?? 0);
        if (loadDiff !== 0) return loadDiff;
        return stableTieBreak(project.id, a.id) - stableTieBreak(project.id, b.id);
      });

      const chosen = pool[0];
      if (!chosen) {
        unassignable.push({ projectId: project.id, reason: "no_eligible_judges" });
        break;
      }

      created.push({
        judgeId: chosen.id,
        projectId: project.id,
        trackFallback,
      });
      assignedPairs.add(`${chosen.id}:${project.id}`);
      assignmentCounts.set(project.id, (assignmentCounts.get(project.id) ?? 0) + 1);
      judgeLoads.set(chosen.id, (judgeLoads.get(chosen.id) ?? 0) + 1);
    }
  }

  return { created, unassignable };
}
