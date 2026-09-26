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

  await prisma.vote.upsert({
    where: { eventId_voterId_trackId: { eventId, voterId, trackId } },
    create: {
      eventId,
      voterId,
      trackId,
      projectId,
      ipHash,
      userAgentHash,
    },
    update: {
      projectId,
      ipHash,
      userAgentHash,
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
