import type { Request } from "express";
import type { CreateTeamBody } from "@dogfood/shared";
import { EventRoleType, Prisma } from "@prisma/client";
import { config } from "../../config.js";
import { audit } from "../../lib/audit.js";
import { clock } from "../../lib/clock.js";
import { conflict, forbidden, notFound, unauthorized } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { generateToken } from "../../lib/tokens.js";
import { submissionsOpen, isVisible } from "../events/phase.js";
import { submissionsClosedError } from "../events/service.js";
import { emitWebhookEvent } from "../webhooks/webhooks.service.js";

function inviteUrl(code: string): string {
  return `${config.PUBLIC_URL}/join/${code}`;
}

function serializeTeam(team: {
  id: string;
  eventId: string;
  name: string;
  inviteCode: string;
  createdAt: Date;
  members?: Array<{
    userId: string;
    joinedAt: Date;
    user: { id: string; email: string; name: string };
  }>;
  project?: {
    id: string;
    title: string;
    status: string;
    submittedAt: Date | null;
  } | null;
  event?: { id: string; name: string; maxTeamSize: number };
}) {
  return {
    id: team.id,
    eventId: team.eventId,
    name: team.name,
    inviteCode: team.inviteCode,
    createdAt: team.createdAt.toISOString(),
    members: (team.members ?? []).map((member) => ({
      userId: member.userId,
      joinedAt: member.joinedAt.toISOString(),
      user: member.user,
    })),
    project: team.project
      ? {
          id: team.project.id,
          title: team.project.title,
          status: team.project.status,
          submittedAt: team.project.submittedAt?.toISOString() ?? null,
        }
      : null,
    event: team.event
      ? {
          id: team.event.id,
          name: team.event.name,
          maxTeamSize: team.event.maxTeamSize,
        }
      : undefined,
  };
}

async function assertCanJoinAsParticipant(userId: string, eventId: string): Promise<void> {
  const judgeRole = await prisma.eventRole.findUnique({
    where: {
      userId_eventId_role: { userId, eventId, role: EventRoleType.JUDGE },
    },
    select: { id: true },
  });
  if (judgeRole) {
    throw conflict("role_conflict", "Judges cannot join a team in this event");
  }

  const existingMembership = await prisma.teamMember.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { teamId: true },
  });
  if (existingMembership) {
    throw conflict("already_in_team", "You are already in a team for this event");
  }
}

export async function createTeam(req: Request, eventId: string, body: CreateTeamBody) {
  if (!req.user) throw unauthorized();

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || !isVisible(event)) throw notFound("Event not found");

  const now = clock.now();
  if (!submissionsOpen(event, now)) {
    throw submissionsClosedError(event.submissionsClose);
  }

  await assertCanJoinAsParticipant(req.user.id, eventId);

  const inviteCode = generateToken(16);

  try {
    const team = await prisma.$transaction(async (tx) => {
      const created = await tx.team.create({
        data: {
          eventId,
          name: body.name,
          inviteCode,
          members: {
            create: {
              userId: req.user!.id,
              eventId,
            },
          },
        },
        include: {
          members: {
            include: { user: { select: { id: true, email: true, name: true } } },
          },
          project: true,
          event: { select: { id: true, name: true, maxTeamSize: true } },
        },
      });

      await tx.eventRole.upsert({
        where: {
          userId_eventId_role: {
            userId: req.user!.id,
            eventId,
            role: EventRoleType.PARTICIPANT,
          },
        },
        create: {
          userId: req.user!.id,
          eventId,
          role: EventRoleType.PARTICIPANT,
        },
        update: {},
      });

      return created;
    });

    await audit(req, "team.create", { type: "team", id: team.id, eventId }, { name: team.name });
    emitWebhookEvent(eventId, "team.created", { teamId: team.id, name: team.name }).catch(() => {});
    return { team: serializeTeam(team), inviteUrl: inviteUrl(team.inviteCode) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = error.meta?.target;
      if (Array.isArray(target) && target.includes("eventId") && target.includes("userId")) {
        throw conflict("already_in_team", "You are already in a team for this event");
      }
      throw conflict("team_name_taken", "A team with this name already exists");
    }
    throw error;
  }
}

export async function previewInvite(code: string) {
  const team = await prisma.team.findUnique({
    where: { inviteCode: code },
    include: {
      event: { select: { id: true, name: true, maxTeamSize: true } },
      _count: { select: { members: true } },
    },
  });
  if (!team) throw notFound("Invite not found");

  return {
    teamName: team.name,
    eventName: team.event.name,
    eventId: team.event.id,
    memberCount: team._count.members,
    maxTeamSize: team.event.maxTeamSize,
  };
}

export async function joinByInvite(req: Request, code: string) {
  if (!req.user) throw unauthorized();

  const team = await prisma.team.findUnique({
    where: { inviteCode: code },
    include: {
      event: true,
      _count: { select: { members: true } },
    },
  });
  if (!team) throw notFound("Invite not found");

  const now = clock.now();
  if (!submissionsOpen(team.event, now)) {
    throw submissionsClosedError(team.event.submissionsClose);
  }

  await assertCanJoinAsParticipant(req.user.id, team.eventId);

  try {
    await prisma.$transaction(async (tx) => {
      // Lock the team row
      await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${team.id} FOR UPDATE`;
      
      const memberCount = await tx.teamMember.count({ where: { teamId: team.id } });
      if (memberCount >= team.event.maxTeamSize) {
        throw conflict("team_full", "This team is full");
      }

      await tx.teamMember.create({
        data: {
          teamId: team.id,
          userId: req.user!.id,
          eventId: team.eventId,
        },
      });
      await tx.eventRole.upsert({
        where: {
          userId_eventId_role: {
            userId: req.user!.id,
            eventId: team.eventId,
            role: EventRoleType.PARTICIPANT,
          },
        },
        create: {
          userId: req.user!.id,
          eventId: team.eventId,
          role: EventRoleType.PARTICIPANT,
        },
        update: {},
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw conflict("already_in_team", "You are already in a team for this event");
    }
    throw error;
  }

  const updated = await prisma.team.findUniqueOrThrow({
    where: { id: team.id },
    include: {
      members: {
        include: { user: { select: { id: true, email: true, name: true } } },
      },
      project: true,
      event: { select: { id: true, name: true, maxTeamSize: true } },
    },
  });

  await audit(req, "team.join", { type: "team", id: team.id, eventId: team.eventId });
  return { team: serializeTeam(updated) };
}

export async function listMine(req: Request) {
  if (!req.user) throw unauthorized();

  const memberships = await prisma.teamMember.findMany({
    where: { userId: req.user.id },
    include: {
      team: {
        include: {
          members: {
            include: { user: { select: { id: true, email: true, name: true } } },
          },
          project: true,
          event: { select: { id: true, name: true, maxTeamSize: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  return { teams: memberships.map((membership) => serializeTeam(membership.team)) };
}

export async function rotateInvite(req: Request, teamId: string) {
  if (!req.user) throw unauthorized();

  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: req.user.id } },
  });
  if (!membership) throw forbidden("forbidden", "Not a team member");

  const inviteCode = generateToken(16);
  const team = await prisma.team.update({
    where: { id: teamId },
    data: { inviteCode },
    include: {
      members: {
        include: { user: { select: { id: true, email: true, name: true } } },
      },
      project: true,
      event: { select: { id: true, name: true, maxTeamSize: true } },
    },
  });

  await audit(req, "team.invite.rotate", { type: "team", id: teamId, eventId: team.eventId });
  return { team: serializeTeam(team), inviteUrl: inviteUrl(team.inviteCode) };
}

export async function leaveTeam(req: Request, teamId: string) {
  if (!req.user) throw unauthorized();

  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: req.user.id } },
    include: { team: { include: { event: true } } },
  });
  if (!membership) throw forbidden("forbidden", "Not a team member");

  const now = clock.now();
  if (!submissionsOpen(membership.team.event, now)) {
    throw submissionsClosedError(membership.team.event.submissionsClose);
  }

  await prisma.$transaction(async (tx) => {
    await tx.teamMember.delete({
      where: { teamId_userId: { teamId, userId: req.user!.id } },
    });

    const remaining = await tx.teamMember.count({
      where: { eventId: membership.eventId, userId: req.user!.id },
    });
    if (remaining === 0) {
      await tx.eventRole.deleteMany({
        where: {
          userId: req.user!.id,
          eventId: membership.eventId,
          role: EventRoleType.PARTICIPANT,
        },
      });
    }
  });

  await audit(req, "team.leave", {
    type: "team",
    id: teamId,
    eventId: membership.eventId,
  });
}
