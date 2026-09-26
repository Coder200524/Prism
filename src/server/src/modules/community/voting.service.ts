import crypto from "node:crypto";
import { EventRoleType, ProjectStatus } from "@prisma/client";
import { config } from "../../config.js";
import { audit } from "../../lib/audit.js";
import type { Request } from "express";
import { clock } from "../../lib/clock.js";
import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { votingEnabled, votingOpen } from "../events/phase.js";
import { shuffleForVoter } from "./ballot.js";
import { checkAbuse, ABUSE_THRESHOLDS } from "./abuse.js";

function hashWithSecret(value: string): string {
  return crypto.createHmac("sha256", config.VOTING_SECRET).update(value).digest("hex");
}

export async function getBallot(eventId: string, voterId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      tracks: {
        include: {
          projects: {
            where: { status: ProjectStatus.SUBMITTED, duplicateOfId: null },
            include: { team: true },
          },
        },
      },
    },
  });

  if (!event || !event.publishedAt || !votingEnabled(event)) {
    throw new HttpError(404, "not_found", "Event not found or voting disabled");
  }

  const votes = await prisma.vote.findMany({
    where: { eventId, voterId },
  });

  const myVotes: Record<string, string> = {};
  for (const vote of votes) {
    myVotes[vote.trackId] = vote.projectId;
  }

  const tracks = event.tracks.map((track) => {
    const projects = track.projects.map((p) => ({
      id: p.id,
      title: p.title,
      summary: p.summary,
      teamName: p.team.name,
    }));
    return {
      trackId: track.id,
      trackName: track.name,
      projects: shuffleForVoter(projects, voterId, eventId),
    };
  });

  return {
    votingOpen: event.votingOpen,
    votingClose: event.votingClose,
    isOpen: votingOpen(event, clock.now()),
    tracks,
    myVotes,
  };
}

export async function castVote(
  req: Request,
  eventId: string,
  voterId: string,
  projectId: string,
) {
  const ip = req.ip ?? "unknown";
  const userAgent = req.get("User-Agent") ?? "unknown";
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || !event.publishedAt || !votingEnabled(event)) {
    throw new HttpError(404, "not_found", "Event not found");
  }

  if (!votingOpen(event, clock.now())) {
    await audit(req, "vote.refused_voting_closed", { type: "Project", id: projectId, eventId });
    throw new HttpError(403, "voting_closed", "Voting is closed");
  }

  const roles = await prisma.eventRole.findMany({
    where: { userId: voterId, eventId, role: { in: [EventRoleType.ORGANIZER, EventRoleType.JUDGE] } },
  });

  if (roles.length > 0) {
    await audit(req, "vote.refused_not_eligible", { type: "Project", id: projectId, eventId });
    throw new HttpError(403, "not_eligible", "Organizers and judges cannot vote");
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId, eventId, status: ProjectStatus.SUBMITTED, duplicateOfId: null },
    include: { team: { include: { members: true } } },
  });

  if (!project) {
    throw new HttpError(404, "not_found", "Project not found");
  }

  if (project.team.members.some((m) => m.userId === voterId)) {
    await audit(req, "vote.refused_own_project", { type: "Project", id: projectId, eventId });
    throw new HttpError(403, "own_project", "Cannot vote for your own project");
  }

  const trackId = project.trackId;
  if (!trackId) {
    throw new HttpError(400, "bad_request", "Project has no track");
  }

  const ipHash = hashWithSecret(ip);
  const userAgentHash = hashWithSecret(userAgent);

  const existing = await prisma.vote.findUnique({
    where: { eventId_voterId_trackId: { eventId, voterId, trackId } },
  });

  const voter = await prisma.user.findUnique({ where: { id: voterId } });
  if (!voter) throw new HttpError(401, "unauthorized", "Voter not found");

  const tenMinsAgo = new Date(clock.now().getTime() - ABUSE_THRESHOLDS.SHARED_IP_TIME_WINDOW_MS);
  
  // Count distinct voters from this IP in the last 10 minutes
  const ipVoters = await prisma.vote.groupBy({
    by: ["voterId"],
    where: { eventId, ipHash, createdAt: { gte: tenMinsAgo } },
  });
  // Include this voter if not already in the group (they are voting now)
  const ipVoterSet = new Set(ipVoters.map(v => v.voterId));
  ipVoterSet.add(voterId);

  const previousVotes = await prisma.vote.findMany({
    where: { eventId, voterId },
  });
  
  const allVoteTimes = previousVotes
    .filter(v => v.trackId !== trackId)
    .map(v => v.createdAt);
  allVoteTimes.push(clock.now());

  const eventTracksCount = await prisma.track.count({ where: { eventId } });

  const abuseCheck = checkAbuse({
    voterCreatedAt: voter.createdAt,
    eventVotingOpen: event.votingOpen,
    ipVoterCountInWindow: ipVoterSet.size,
    voterVoteTimes: allVoteTimes,
    totalTracksInEvent: eventTracksCount,
  });

  await prisma.vote.upsert({
    where: { eventId_voterId_trackId: { eventId, voterId, trackId } },
    create: {
      eventId,
      voterId,
      trackId,
      projectId,
      ipHash,
      userAgentHash,
      flagged: abuseCheck.flagged,
      flagReasons: abuseCheck.reasons,
    },
    update: {
      projectId,
      ipHash,
      userAgentHash,
      flagged: abuseCheck.flagged,
      flagReasons: abuseCheck.reasons,
    },
  });

  await audit(
    req,
    existing ? "vote.change" : "vote.cast",
    { type: "Project", id: projectId, eventId },
    { trackId, previousProjectId: existing?.projectId }
  );

  return { trackId, projectId };
}

export async function retractVote(req: Request, eventId: string, voterId: string, trackId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || !event.publishedAt || !votingEnabled(event)) {
    throw new HttpError(404, "not_found", "Event not found");
  }

  if (!votingOpen(event, clock.now())) {
    throw new HttpError(403, "voting_closed", "Voting is closed");
  }

  const existing = await prisma.vote.findUnique({
    where: { eventId_voterId_trackId: { eventId, voterId, trackId } },
  });

  if (!existing) {
    throw new HttpError(404, "not_found", "Vote not found");
  }

  await prisma.vote.delete({
    where: { eventId_voterId_trackId: { eventId, voterId, trackId } },
  });

  await audit(req, "vote.retract", { type: "Project", id: existing.projectId, eventId }, { trackId });
}

export async function getCommunityResults(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || !event.publishedAt) {
    throw new HttpError(404, "not_found", "Event not found");
  }

  const now = clock.now();
  if (!event.votingClose || now <= event.votingClose) {
    throw new HttpError(403, "results_hidden", "Results are hidden until voting closes");
  }

  const tracks = await prisma.track.findMany({ where: { eventId } });
  
  // Fetch non-voided votes
  const votes = await prisma.vote.findMany({
    where: { eventId, voidedAt: null },
    include: { project: true },
  });

  const results: Record<string, { rank: number; projectId: string; title: string; votes: number; flaggedExcluded: number }[]> = {};

  for (const track of tracks) {
    const trackVotes = votes.filter((v) => v.trackId === track.id);
    
    const projectStats = new Map<string, { title: string; count: number; flagged: number }>();

    for (const vote of trackVotes) {
      const stats = projectStats.get(vote.projectId) ?? { title: vote.project.title, count: 0, flagged: 0 };
      if (vote.flagged) {
        stats.flagged += 1;
      } else {
        stats.count += 1;
      }
      projectStats.set(vote.projectId, stats);
    }

    const sorted = Array.from(projectStats.entries())
      .map(([projectId, stats]) => ({
        projectId,
        title: stats.title,
        votes: stats.count,
        flaggedExcluded: stats.flagged,
      }))
      .sort((a, b) => b.votes - a.votes);

    let currentRank = 1;
    let prevVotes = -1;
    let actualRank = 1;

    const ranked = sorted.map((p) => {
      if (p.votes !== prevVotes) {
        currentRank = actualRank;
      }
      prevVotes = p.votes;
      actualRank++;
      return { ...p, rank: currentRank };
    });

    results[track.id] = ranked;
  }

  return results;
}

export async function getCommunityTurnout(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new HttpError(404, "not_found", "Event not found");

  const votes = await prisma.vote.findMany({ where: { eventId, voidedAt: null } });

  const totalVotes = votes.length;
  const flaggedCount = votes.filter((v) => v.flagged).length;
  const uniqueVoters = new Set(votes.map((v) => v.voterId)).size;

  return { totalVotes, uniqueVoters, flaggedCount };
}

export async function getFlaggedVotes(eventId: string) {
  const votes = await prisma.vote.findMany({
    where: { eventId, flagged: true, voidedAt: null },
    include: {
      voter: { select: { id: true, name: true } },
      project: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return votes.map((v) => ({
    id: v.id,
    voterName: v.voter.name,
    projectTitle: v.project.title,
    flagReasons: v.flagReasons,
    createdAt: v.createdAt,
  }));
}

export async function voidVote(req: Request, voteId: string, reason: string, userId: string) {
  const vote = await prisma.vote.findUnique({ where: { id: voteId } });
  if (!vote) throw new HttpError(404, "not_found", "Vote not found");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const isOrg = await prisma.eventRole.findFirst({ where: { eventId: vote.eventId, userId, role: EventRoleType.ORGANIZER } });
  if (user?.platformRole !== "ADMIN" && !isOrg) {
    throw new HttpError(403, "forbidden", "Not authorized");
  }

  await prisma.vote.update({
    where: { id: voteId },
    data: {
      voidedAt: clock.now(),
      voidedById: userId,
      voidReason: reason,
    },
  });

  await audit(req, "vote.void", { type: "Vote", id: voteId, eventId: vote.eventId }, { reason });
}

export async function restoreVote(req: Request, voteId: string, userId: string) {
  const vote = await prisma.vote.findUnique({ where: { id: voteId } });
  if (!vote) throw new HttpError(404, "not_found", "Vote not found");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const isOrg = await prisma.eventRole.findFirst({ where: { eventId: vote.eventId, userId, role: EventRoleType.ORGANIZER } });
  if (user?.platformRole !== "ADMIN" && !isOrg) {
    throw new HttpError(403, "forbidden", "Not authorized");
  }

  await prisma.vote.update({
    where: { id: voteId },
    data: {
      voidedAt: null,
      voidedById: null,
      voidReason: "",
    },
  });

  await audit(req, "vote.restore", { type: "Vote", id: voteId, eventId: vote.eventId });
}
