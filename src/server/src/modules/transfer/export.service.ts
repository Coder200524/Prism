import type { Request } from "express";
import { audit } from "../../lib/audit.js";
import { clock } from "../../lib/clock.js";
import { toCsv } from "../../lib/csv.js";
import { notFound, unauthorized } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";

export async function exportEventJson(req: Request, eventId: string) {
  if (!req.user) throw unauthorized();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      tracks: { orderBy: { name: "asc" } },
      prizes: { orderBy: [{ place: "asc" }, { name: "asc" }] },
      criteria: { orderBy: { position: "asc" } },
      roles: {
        where: { role: "JUDGE" },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      },
      judgeTracks: {
        include: { track: { select: { id: true, name: true } } },
      },
      teams: {
        include: {
          members: {
            include: { user: { select: { email: true } } },
          },
        },
      },
      projects: {
        include: {
          team: { select: { name: true } },
          track: { select: { name: true } },
        },
      },
      assignments: {
        include: {
          scores: { include: { criterion: true } },
        },
      },
      votes: true,
      comments: {
        where: { hiddenAt: null },
        include: { author: { select: { name: true } } },
      },
    },
  });

  if (!event) throw notFound("Event not found");

  // Map judges with preferred track IDs
  const judgeTracksMap = new Map<string, string[]>();
  for (const jt of event.judgeTracks) {
    const list = judgeTracksMap.get(jt.userId) ?? [];
    list.push(jt.trackId);
    judgeTracksMap.set(jt.userId, list);
  }

  const judgesList = event.roles.map((r) => ({
    id: r.user.id,
    name: r.user.name,
    email: r.user.email,
    tracks: judgeTracksMap.get(r.user.id) ?? [],
  }));

  // Map teams
  const teamsList = event.teams.map((t) => ({
    id: t.id,
    name: t.name,
    inviteCode: t.inviteCode,
    members: t.members.map((m) => m.user.email),
  }));

  // Map projects
  const projectsList = event.projects.map((p) => ({
    id: p.id,
    teamId: p.teamId,
    team: p.teamId,
    trackId: p.trackId,
    track: p.trackId,
    title: p.title,
    summary: p.summary,
    repo_url: p.repoUrl,
    repoUrl: p.repoUrl,
    demo_url: p.demoUrl,
    demoUrl: p.demoUrl,
    status: p.status,
    submitted_at: p.submittedAt?.toISOString() ?? null,
    submittedAt: p.submittedAt?.toISOString() ?? null,
  }));

  // Map scores / assignments
  const scoresList = event.assignments
    .filter((a) => a.scores.length > 0)
    .map((a) => {
      const criteriaMap: Record<string, number> = {};
      const scoresArray: Array<{ criterionKey: string; value: number }> = [];
      for (const s of a.scores) {
        criteriaMap[s.criterion.key] = s.value;
        scoresArray.push({ criterionKey: s.criterion.key, value: s.value });
      }
      return {
        id: a.id,
        judge: a.judgeId,
        judgeId: a.judgeId,
        project: a.projectId,
        projectId: a.projectId,
        criteria: criteriaMap,
        scores: scoresArray,
        comment: a.comment,
      };
    });

  // Map votes pseudonymizing voter IDs
  const voterIdMap = new Map<string, string>();
  let voterCounter = 1;
  const votesList = event.votes.map((v) => {
    let psId = voterIdMap.get(v.voterId);
    if (!psId) {
      psId = `voter_${String(voterCounter++).padStart(2, "0")}`;
      voterIdMap.set(v.voterId, psId);
    }
    return {
      id: v.id,
      voterId: psId,
      projectId: v.projectId,
      trackId: v.trackId,
      createdAt: v.createdAt.toISOString(),
      flagged: v.flagged,
    };
  });

  // Map comments
  const commentsList = event.comments.map((c) => ({
    id: c.id,
    projectId: c.projectId,
    authorName: c.author.name,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
  }));

  await audit(req, "export.json", { type: "event", id: eventId, eventId });

  return {
    format: "dogfood-event",
    version: 1,
    exportedAt: clock.now().toISOString(),
    event: {
      id: event.id,
      name: event.name,
      description: event.description,
      submissionsOpen: event.submissionsOpen.toISOString(),
      submissionsClose: event.submissionsClose.toISOString(),
      submissions_close: event.submissionsClose.toISOString(),
      judgingClose: event.judgingClose?.toISOString() ?? null,
      votingOpen: event.votingOpen?.toISOString() ?? null,
      votingClose: event.votingClose?.toISOString() ?? null,
      publishedAt: event.publishedAt?.toISOString() ?? null,
      resultsPublishedAt: event.resultsPublishedAt?.toISOString() ?? null,
      maxTeamSize: event.maxTeamSize,
      reviewsPerProject: event.reviewsPerProject,
    },
    tracks: event.tracks.map((t) => ({ id: t.id, name: t.name, description: t.description })),
    prizes: event.prizes.map((p) => ({
      id: p.id,
      trackId: p.trackId,
      name: p.name,
      description: p.description,
      value: p.value,
      place: p.place,
    })),
    criteria: event.criteria.map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      description: c.description,
      weight: c.weight,
      minScore: c.minScore,
      maxScore: c.maxScore,
      position: c.position,
    })),
    judges: judgesList,
    teams: teamsList,
    projects: projectsList,
    assignments: event.assignments.map((a) => ({
      id: a.id,
      judgeId: a.judgeId,
      projectId: a.projectId,
      status: a.status,
    })),
    scores: scoresList,
    votes: votesList,
    comments: commentsList,
  };
}

export async function exportProjectsCsv(req: Request, eventId: string): Promise<string> {
  if (!req.user) throw unauthorized();

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) throw notFound("Event not found");

  const projects = await prisma.project.findMany({
    where: { eventId },
    include: {
      team: { select: { name: true } },
      track: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const header = ["id", "title", "track", "team", "status", "submittedAt", "repoUrl", "demoUrl"];
  const rows: Array<Array<string | number | null | undefined>> = [header];

  for (const p of projects) {
    rows.push([
      p.id,
      p.title,
      p.track?.name ?? "",
      p.team.name,
      p.status,
      p.submittedAt?.toISOString() ?? "",
      p.repoUrl,
      p.demoUrl,
    ]);
  }

  await audit(req, "export.projects_csv", { type: "event", id: eventId, eventId });
  return toCsv(rows);
}

export async function exportJudgesCsv(req: Request, eventId: string): Promise<string> {
  if (!req.user) throw unauthorized();

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) throw notFound("Event not found");

  const judgeRoles = await prisma.eventRole.findMany({
    where: { eventId, role: "JUDGE" },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const judgeTracks = await prisma.judgeTrack.findMany({
    where: { eventId },
    include: { track: { select: { name: true } } },
  });

  const tracksByJudge = new Map<string, string[]>();
  for (const jt of judgeTracks) {
    const list = tracksByJudge.get(jt.userId) ?? [];
    list.push(jt.track.name);
    tracksByJudge.set(jt.userId, list);
  }

  const header = ["email", "name", "tracks"];
  const rows: Array<Array<string | number | null | undefined>> = [header];

  for (const jr of judgeRoles) {
    const tracksStr = (tracksByJudge.get(jr.user.id) ?? []).join("|");
    rows.push([jr.user.email, jr.user.name, tracksStr]);
  }

  await audit(req, "export.judges_csv", { type: "event", id: eventId, eventId });
  return toCsv(rows);
}
