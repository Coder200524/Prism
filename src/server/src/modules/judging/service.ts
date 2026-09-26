import type { Request } from "express";
import type {
  JudgeInviteBody,
  JudgeTracksBody,
  ManualAssignmentBody,
  PutCriteriaBody,
  ScoreUpdateBody,
} from "@dogfood/shared";
import {
  AssignmentStatus,
  EventRoleType,
  ProjectStatus,
} from "@prisma/client";
import { config } from "../../config.js";
import { audit } from "../../lib/audit.js";
import { clock } from "../../lib/clock.js";
import { toCsv } from "../../lib/csv.js";
import {
  badRequest,
  conflict,
  forbidden,
  HttpError,
  notFound,
  unauthorized,
} from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { generateToken, hashToken } from "../../lib/tokens.js";
import { judgingOpen } from "../events/phase.js";
import { assignReviews } from "./assignment.js";
import { computeWeightedTotal, normalizeScores, roundDisplay } from "./normalization.js";
import {
  buildNormalizationInput,
  organizerResultsView,
  publicResultsView,
} from "./results.js";

const JUDGE_INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function loadEventOrThrow(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw notFound("Event not found");
  return event;
}

async function loadEventNormData(eventId: string) {
  const event = await loadEventOrThrow(eventId);
  const [criteria, projects, assignments, tracks] = await Promise.all([
    prisma.criterion.findMany({
      where: { eventId },
      orderBy: { position: "asc" },
    }),
    prisma.project.findMany({
      where: { eventId, status: ProjectStatus.SUBMITTED },
      include: { team: { select: { name: true } } },
    }),
    prisma.assignment.findMany({
      where: { eventId },
      include: {
        scores: { include: { criterion: { select: { key: true } } } },
      },
    }),
    prisma.track.findMany({ where: { eventId }, orderBy: { name: "asc" } }),
  ]);
  return { event, criteria, projects, assignments, tracks };
}

export async function getCriteria(eventId: string) {
  await loadEventOrThrow(eventId);
  const criteria = await prisma.criterion.findMany({
    where: { eventId },
    orderBy: { position: "asc" },
  });
  return { criteria };
}

export async function putCriteria(req: Request, eventId: string, body: PutCriteriaBody) {
  await loadEventOrThrow(eventId);
  const weightSum = body.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (weightSum !== 100) {
    throw badRequest("Criterion weights must sum to 100");
  }
  for (const criterion of body.criteria) {
    if (!(criterion.minScore < criterion.maxScore)) {
      throw badRequest("minScore must be less than maxScore");
    }
  }

  const existing = await prisma.criterion.findMany({ where: { eventId } });
  const incomingKeys = new Set(body.criteria.map((criterion) => criterion.key));
  const removed = existing.filter((criterion) => !incomingKeys.has(criterion.key));
  for (const criterion of removed) {
    const inUse = await prisma.criterionScore.count({ where: { criterionId: criterion.id } });
    if (inUse > 0) {
      throw conflict("criterion_in_use", `Criterion "${criterion.key}" already has scores`);
    }
  }

  await prisma.$transaction(async (tx) => {
    if (removed.length > 0) {
      await tx.criterion.deleteMany({
        where: { id: { in: removed.map((criterion) => criterion.id) } },
      });
    }
    const keys = new Set(body.criteria.map(c => c.key));
    if (keys.size !== body.criteria.length) {
      throw badRequest("Criteria keys must be unique");
    }
    for (let index = 0; index < body.criteria.length; index += 1) {
      const criterion = body.criteria[index];
      if (!criterion) continue;
      await tx.criterion.upsert({
        where: { eventId_key: { eventId, key: criterion.key } },
        create: {
          eventId,
          key: criterion.key,
          name: criterion.name,
          description: criterion.description,
          weight: criterion.weight,
          minScore: criterion.minScore,
          maxScore: criterion.maxScore,
          position: index,
        },
        update: {
          name: criterion.name,
          description: criterion.description,
          weight: criterion.weight,
          minScore: criterion.minScore,
          maxScore: criterion.maxScore,
          position: index,
        },
      });
    }
  });

  await audit(req, "rubric.update", { type: "event", id: eventId, eventId });
  return getCriteria(eventId);
}

export async function listJudges(eventId: string) {
  await loadEventOrThrow(eventId);
  const judges = await prisma.eventRole.findMany({
    where: { eventId, role: EventRoleType.JUDGE },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          judgeTracks: {
            where: { eventId },
            select: { trackId: true },
          },
          assignments: {
            where: { eventId },
            select: { id: true, status: true },
          },
        },
      },
    },
  });

  return {
    judges: judges.map((row) => ({
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      trackIds: row.user.judgeTracks.map((track) => track.trackId),
      assigned: row.user.assignments.length,
      submitted: row.user.assignments.filter((assignment) => assignment.status === "SUBMITTED")
        .length,
    })),
  };
}

export async function createJudgeInvite(req: Request, eventId: string, body: JudgeInviteBody) {
  await loadEventOrThrow(eventId);
  if (body.trackIds.length > 0) {
    const tracks = await prisma.track.count({
      where: { eventId, id: { in: body.trackIds } },
    });
    if (tracks !== body.trackIds.length) {
      throw badRequest("One or more trackIds are invalid for this event");
    }
  }

  const token = generateToken(32);
  const expiresAt = new Date(clock.now().getTime() + JUDGE_INVITE_TTL_MS);
  const invite = await prisma.judgeInvite.create({
    data: {
      eventId,
      email: body.email.toLowerCase(),
      trackIds: body.trackIds,
      tokenHash: hashToken(token),
      createdById: req.user!.id,
      expiresAt,
    },
  });

  await audit(req, "judge.invite", { type: "judge_invite", id: invite.id, eventId }, {
    email: invite.email,
  });

  return {
    inviteUrl: `${config.PUBLIC_URL}/judge-invite/${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function previewJudgeInvite(token: string) {
  const invite = await prisma.judgeInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { event: { select: { id: true, name: true } } },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt <= clock.now()) {
    throw notFound("Invite not found");
  }
  return {
    eventId: invite.event.id,
    eventName: invite.event.name,
    email: invite.email,
  };
}

export async function acceptJudgeInvite(req: Request, token: string) {
  if (!req.user) throw unauthorized();
  const invite = await prisma.judgeInvite.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt <= clock.now()) {
    throw notFound("Invite not found");
  }
  if (req.user.email.toLowerCase() !== invite.email.toLowerCase()) {
    throw forbidden("invite_email_mismatch", "Logged-in email must match the invite email");
  }

  const participant = await prisma.eventRole.findUnique({
    where: {
      userId_eventId_role: {
        userId: req.user.id,
        eventId: invite.eventId,
        role: EventRoleType.PARTICIPANT,
      },
    },
  });
  if (participant) {
    throw conflict("role_conflict", "Participants cannot become judges in the same event");
  }

  await prisma.$transaction(async (tx) => {
    await tx.eventRole.upsert({
      where: {
        userId_eventId_role: {
          userId: req.user!.id,
          eventId: invite.eventId,
          role: EventRoleType.JUDGE,
        },
      },
      create: {
        userId: req.user!.id,
        eventId: invite.eventId,
        role: EventRoleType.JUDGE,
      },
      update: {},
    });
    for (const trackId of invite.trackIds) {
      await tx.judgeTrack.upsert({
        where: { userId_trackId: { userId: req.user!.id, trackId } },
        create: { userId: req.user!.id, trackId, eventId: invite.eventId },
        update: { eventId: invite.eventId },
      });
    }
    await tx.judgeInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: clock.now() },
    });
  });

  await audit(req, "judge.accept", { type: "user", id: req.user.id, eventId: invite.eventId });
  return { ok: true };
}

export async function setJudgeTracks(
  req: Request,
  eventId: string,
  userId: string,
  body: JudgeTracksBody,
) {
  const judgeRole = await prisma.eventRole.findUnique({
    where: {
      userId_eventId_role: { userId, eventId, role: EventRoleType.JUDGE },
    },
  });
  if (!judgeRole) throw notFound("Judge not found");

  if (body.trackIds.length > 0) {
    const tracks = await prisma.track.count({
      where: { eventId, id: { in: body.trackIds } },
    });
    if (tracks !== body.trackIds.length) {
      throw badRequest("One or more trackIds are invalid for this event");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.judgeTrack.deleteMany({ where: { userId, eventId } });
    for (const trackId of body.trackIds) {
      await tx.judgeTrack.create({
        data: { userId, trackId, eventId },
      });
    }
  });

  await audit(req, "judge.tracks.update", { type: "user", id: userId, eventId }, {
    trackIds: body.trackIds,
  });
  return listJudges(eventId);
}

export async function removeJudge(req: Request, eventId: string, userId: string) {
  const submitted = await prisma.assignment.count({
    where: { eventId, judgeId: userId, status: AssignmentStatus.SUBMITTED },
  });
  if (submitted > 0) {
    throw conflict("judge_has_scores", "Cannot remove a judge who has submitted scores");
  }

  await prisma.$transaction(async (tx) => {
    await tx.assignment.deleteMany({
      where: { eventId, judgeId: userId, status: AssignmentStatus.PENDING },
    });
    await tx.judgeTrack.deleteMany({ where: { eventId, userId } });
    await tx.eventRole.deleteMany({
      where: { eventId, userId, role: EventRoleType.JUDGE },
    });
  });

  await audit(req, "judge.remove", { type: "user", id: userId, eventId });
}

export async function listAssignments(eventId: string) {
  await loadEventOrThrow(eventId);
  const assignments = await prisma.assignment.findMany({
    where: { eventId },
    include: {
      judge: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, title: true, trackId: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return {
    assignments: assignments.map((assignment) => ({
      id: assignment.id,
      judgeId: assignment.judgeId,
      judgeName: assignment.judge.name,
      projectId: assignment.projectId,
      projectTitle: assignment.project.title,
      trackId: assignment.project.trackId,
      status: assignment.status,
      submittedAt: assignment.submittedAt?.toISOString() ?? null,
    })),
  };
}

export async function autoAssign(req: Request, eventId: string) {
  const event = await loadEventOrThrow(eventId);
  const [projects, judges, existing] = await Promise.all([
    prisma.project.findMany({
      where: {
        eventId,
        status: ProjectStatus.SUBMITTED,
        duplicateOfId: null,
      },
      include: {
        team: {
          include: {
            members: {
              include: { user: { select: { id: true, email: true } } },
            },
          },
        },
      },
    }),
    prisma.eventRole.findMany({
      where: { eventId, role: EventRoleType.JUDGE },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            judgeTracks: { where: { eventId }, select: { trackId: true } },
          },
        },
      },
    }),
    prisma.assignment.findMany({
      where: { eventId },
      select: { judgeId: true, projectId: true },
    }),
  ]);

  const result = assignReviews({
    projects: projects.map((project) => ({
      id: project.id,
      trackId: project.trackId,
      teamMemberUserIds: project.team.members.map((member) => member.user.id),
      teamMemberEmails: project.team.members.map((member) => member.user.email),
    })),
    judges: judges.map((row) => ({
      id: row.user.id,
      email: row.user.email,
      trackIds: row.user.judgeTracks.map((track) => track.trackId),
    })),
    existing,
    reviewsPerProject: event.reviewsPerProject,
  });

  if (result.created.length > 0) {
    await prisma.assignment.createMany({
      data: result.created.map((row) => ({
        eventId,
        judgeId: row.judgeId,
        projectId: row.projectId,
        status: AssignmentStatus.PENDING,
      })),
      skipDuplicates: true,
    });
  }

  await audit(req, "assignment.auto", { type: "event", id: eventId, eventId }, {
    created: result.created.length,
    unassignable: result.unassignable.length,
  });

  return {
    created: result.created.length,
    unassignable: result.unassignable,
  };
}

export async function manualAssign(req: Request, eventId: string, body: ManualAssignmentBody) {
  await loadEventOrThrow(eventId);
  const [project, judgeRole, existing] = await Promise.all([
    prisma.project.findFirst({
      where: {
        id: body.projectId,
        eventId,
        status: ProjectStatus.SUBMITTED,
        duplicateOfId: null,
      },
      include: {
        team: {
          include: {
            members: { include: { user: { select: { id: true, email: true } } } },
          },
        },
      },
    }),
    prisma.eventRole.findUnique({
      where: {
        userId_eventId_role: {
          userId: body.judgeId,
          eventId,
          role: EventRoleType.JUDGE,
        },
      },
      include: {
        user: { select: { id: true, email: true } },
      },
    }),
    prisma.assignment.findUnique({
      where: {
        judgeId_projectId: { judgeId: body.judgeId, projectId: body.projectId },
      },
    }),
  ]);

  if (!project) throw notFound("Project not found or not assignable");
  if (!judgeRole) throw notFound("Judge not found");
  if (existing) throw conflict("assignment_exists", "Assignment already exists");

  const memberIds = project.team.members.map((member) => member.user.id);
  const memberEmails = project.team.members.map((member) => member.user.email.toLowerCase());
  if (
    memberIds.includes(judgeRole.user.id) ||
    memberEmails.includes(judgeRole.user.email.toLowerCase())
  ) {
    throw conflict("assignment_conflict", "Judge is a member of the project team");
  }

  const assignment = await prisma.assignment.create({
    data: {
      eventId,
      judgeId: body.judgeId,
      projectId: body.projectId,
      status: AssignmentStatus.PENDING,
    },
  });
  await audit(req, "assignment.create", {
    type: "assignment",
    id: assignment.id,
    eventId,
  });
  return { assignment };
}

export async function deleteAssignment(req: Request, assignmentId: string) {
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw notFound("Assignment not found");
  if (assignment.status !== AssignmentStatus.PENDING) {
    throw conflict("assignment_submitted", "Only PENDING assignments can be deleted");
  }

  // Organizer check is in route via event role after lookup.
  await prisma.assignment.delete({ where: { id: assignmentId } });
  await audit(req, "assignment.delete", {
    type: "assignment",
    id: assignmentId,
    eventId: assignment.eventId,
  });
  return assignment;
}

export async function listJudgeAssignments(req: Request, eventId?: string) {
  if (!req.user) throw unauthorized();
  const judgeRoles = await prisma.eventRole.findMany({
    where: {
      userId: req.user.id,
      role: EventRoleType.JUDGE,
      ...(eventId ? { eventId } : {}),
    },
    select: { eventId: true },
  });
  if (judgeRoles.length === 0 && req.user.platformRole !== "ADMIN") {
    throw forbidden("not_a_judge", "Not a judge");
  }

  const eventIds = judgeRoles.map((role) => role.eventId);
  const assignments = await prisma.assignment.findMany({
    where: {
      judgeId: req.user.id,
      ...(eventId ? { eventId } : { eventId: { in: eventIds } }),
    },
    include: {
      project: {
        select: {
          id: true,
          title: true,
          summary: true,
          trackId: true,
          repoUrl: true,
          demoUrl: true,
        },
      },
      scores: { include: { criterion: { select: { key: true } } } },
      event: { select: { id: true, name: true } },
    },
    orderBy: [{ eventId: "asc" }, { createdAt: "asc" }],
  });

  return {
    assignments: assignments.map((assignment) => ({
      id: assignment.id,
      eventId: assignment.eventId,
      eventName: assignment.event.name,
      status: assignment.status,
      comment: assignment.comment,
      submittedAt: assignment.submittedAt?.toISOString() ?? null,
      project: assignment.project,
      scores: Object.fromEntries(
        assignment.scores.map((score) => [score.criterion.key, score.value]),
      ),
    })),
  };
}

export async function getJudgeAssignment(req: Request, assignmentId: string) {
  if (!req.user) throw unauthorized();
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      project: true,
      scores: { include: { criterion: true } },
      event: {
        include: { criteria: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!assignment) throw notFound("Assignment not found");
  const isOwner = assignment.judgeId === req.user.id;
  const isAdmin = req.user.platformRole === "ADMIN";
  let isOrganizer = false;
  if (!isOwner && !isAdmin) {
    const organizerRole = await prisma.eventRole.findUnique({
      where: {
        userId_eventId_role: {
          userId: req.user.id,
          eventId: assignment.eventId,
          role: EventRoleType.ORGANIZER,
        },
      },
      select: { id: true },
    });
    isOrganizer = Boolean(organizerRole);
  }
  if (!isOwner && !isAdmin && !isOrganizer) {
    throw forbidden("forbidden", "Judges can only view their own assignments.");
  }

  return {
    assignment: {
      id: assignment.id,
      eventId: assignment.eventId,
      status: assignment.status,
      comment: assignment.comment,
      submittedAt: assignment.submittedAt?.toISOString() ?? null,
      project: assignment.project,
      criteria: assignment.event.criteria,
      scores: Object.fromEntries(
        assignment.scores.map((score) => [score.criterion.key, score.value]),
      ),
    },
  };
}

export async function updateScores(req: Request, assignmentId: string, body: ScoreUpdateBody) {
  if (!req.user) throw unauthorized();
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      event: { include: { criteria: true } },
    },
  });
  if (!assignment) throw notFound("Assignment not found");
  if (assignment.judgeId !== req.user.id && req.user.platformRole !== "ADMIN") {
    throw forbidden("forbidden", "Judges can only update their own scores.");
  }

  const now = clock.now();
  if (!judgingOpen(assignment.event, now)) {
    throw new HttpError(403, "judging_closed", "Judging is closed for this event");
  }

  const criteriaByKey = new Map(
    assignment.event.criteria.map((criterion) => [criterion.key, criterion]),
  );

  if (body.submit) {
    for (const criterion of assignment.event.criteria) {
      if (body.scores[criterion.key] === undefined) {
        throw badRequest(`Missing score for criterion ${criterion.key}`);
      }
    }
  }

  for (const [key, value] of Object.entries(body.scores)) {
    const criterion = criteriaByKey.get(key);
    if (!criterion) throw badRequest(`Unknown criterion ${key}`);
    if (value < criterion.minScore || value > criterion.maxScore) {
      throw badRequest(
        `Score for ${key} must be between ${criterion.minScore} and ${criterion.maxScore}`,
      );
    }
  }

  const wasSubmitted = assignment.status === AssignmentStatus.SUBMITTED;

  await prisma.$transaction(async (tx) => {
    for (const [key, value] of Object.entries(body.scores)) {
      const criterion = criteriaByKey.get(key);
      if (!criterion) continue;
      await tx.criterionScore.upsert({
        where: {
          assignmentId_criterionId: {
            assignmentId,
            criterionId: criterion.id,
          },
        },
        create: { assignmentId, criterionId: criterion.id, value },
        update: { value },
      });
    }

    await tx.assignment.update({
      where: { id: assignmentId },
      data: {
        comment: body.comment !== undefined ? body.comment : assignment.comment,
        ...(body.submit
          ? {
              status: AssignmentStatus.SUBMITTED,
              submittedAt: assignment.submittedAt ?? now,
            }
          : {}),
      },
    });
  });

  if (wasSubmitted) {
    await audit(req, "score.edit_after_submit", {
      type: "assignment",
      id: assignmentId,
      eventId: assignment.eventId,
    });
  } else if (body.submit) {
    await audit(req, "score.submit", {
      type: "assignment",
      id: assignmentId,
      eventId: assignment.eventId,
    });
  } else {
    await audit(req, "score.save", {
      type: "assignment",
      id: assignmentId,
      eventId: assignment.eventId,
    });
  }

  return getJudgeAssignment(req, assignmentId);
}

export async function getJudgeScores(
  req: Request,
  query: { judge?: string; eventId?: string },
) {
  if (!req.user) throw unauthorized();

  const requestedJudgeId = query.judge ?? req.user.id;
  const isSelf = requestedJudgeId === req.user.id;

  if (!isSelf) {
    const isAdmin = req.user.platformRole === "ADMIN";
    let allowed = isAdmin;
    if (!isAdmin) {
      if (query.eventId) {
        const organizer = await prisma.eventRole.findUnique({
          where: {
            userId_eventId_role: {
              userId: req.user.id,
              eventId: query.eventId,
              role: EventRoleType.ORGANIZER,
            },
          },
        });
        allowed = Boolean(organizer);
      } else {
        const organized = await prisma.eventRole.findMany({
          where: { userId: req.user.id, role: EventRoleType.ORGANIZER },
          select: { eventId: true },
        });
        allowed = organized.length > 0;
        if (allowed && !query.eventId) {
          // Restrict to events they organize below.
        }
      }
    }

    if (!allowed) {
      let validEventId: string | undefined = undefined;
      if (query.eventId) {
        const evt = await prisma.event.findUnique({ where: { id: query.eventId } });
        if (evt) validEventId = query.eventId;
      }
      
      const targetEvents = validEventId
        ? [{ eventId: validEventId }]
        : await prisma.eventRole.findMany({
            where: { userId: requestedJudgeId, role: EventRoleType.JUDGE },
            select: { eventId: true },
          });

      if (targetEvents.length === 0) {
        await audit(req, "access.denied_peer_scores", {
          type: "user",
          id: requestedJudgeId,
          eventId: undefined,
        });
      } else {
        for (const te of targetEvents) {
          await audit(req, "access.denied_peer_scores", {
            type: "user",
            id: requestedJudgeId,
            eventId: te.eventId,
          });
        }
      }

      if (query.eventId && !validEventId) {
        throw notFound("Event not found");
      }
      throw forbidden("forbidden", "Judges can only view their own scores.");
    }
  } else {
    const judgeRole = await prisma.eventRole.findFirst({
      where: { userId: req.user.id, role: EventRoleType.JUDGE },
    });
    if (!judgeRole && req.user.platformRole !== "ADMIN") {
      throw forbidden("not_a_judge", "Not a judge");
    }
  }

  let eventFilter: string[] | undefined;
  if (!isSelf && req.user.platformRole !== "ADMIN") {
    if (query.eventId) {
      eventFilter = [query.eventId];
    } else {
      const organized = await prisma.eventRole.findMany({
        where: { userId: req.user.id, role: EventRoleType.ORGANIZER },
        select: { eventId: true },
      });
      eventFilter = organized.map((row) => row.eventId);
    }
  } else if (query.eventId) {
    eventFilter = [query.eventId];
  }

  const assignments = await prisma.assignment.findMany({
    where: {
      judgeId: requestedJudgeId,
      ...(eventFilter ? { eventId: { in: eventFilter } } : {}),
    },
    include: {
      project: { select: { id: true, title: true } },
      scores: { include: { criterion: true } },
      event: { include: { criteria: true } },
    },
    orderBy: [{ eventId: "asc" }, { id: "asc" }],
  });

  return {
    items: assignments.map((assignment) => {
      const scores = Object.fromEntries(
        assignment.scores.map((score) => [score.criterion.key, score.value]),
      );
      const { total } = computeWeightedTotal(
        assignment.scores.map((score) => ({
          criterionKey: score.criterion.key,
          value: score.value,
        })),
        assignment.event.criteria.map((criterion) => ({
          id: criterion.id,
          key: criterion.key,
          weight: criterion.weight,
          minScore: criterion.minScore,
          maxScore: criterion.maxScore,
        })),
      );
      return {
        assignmentId: assignment.id,
        eventId: assignment.eventId,
        projectId: assignment.projectId,
        projectTitle: assignment.project.title,
        status: assignment.status,
        comment: assignment.comment,
        scores,
        weightedTotal: roundDisplay(total),
        submittedAt: assignment.submittedAt?.toISOString() ?? null,
      };
    }),
  };
}

export async function getResults(req: Request, eventId: string) {
  const data = await loadEventNormData(eventId);
  const isOrganizer =
    req.user &&
    (req.user.platformRole === "ADMIN" ||
      Boolean(
        await prisma.eventRole.findUnique({
          where: {
            userId_eventId_role: {
              userId: req.user.id,
              eventId,
              role: EventRoleType.ORGANIZER,
            },
          },
        }),
      ));

  if (!isOrganizer && !data.event.resultsPublishedAt) {
    throw forbidden("forbidden", "Results are not published");
  }

  const normalized = normalizeScores(
    buildNormalizationInput({
      criteria: data.criteria,
      assignments: data.assignments,
      projects: data.projects,
      reviewsPerProject: data.event.reviewsPerProject,
    }),
  );

  const extras = {
    tracks: data.tracks,
    projects: data.projects.map((project) => ({
      id: project.id,
      teamName: project.team.name,
    })),
  };

  return isOrganizer
    ? { results: organizerResultsView(normalized, extras), published: Boolean(data.event.resultsPublishedAt) }
    : { results: publicResultsView(normalized, extras), published: true };
}

export async function publishResults(req: Request, eventId: string) {
  await loadEventOrThrow(eventId);
  const event = await prisma.event.update({
    where: { id: eventId },
    data: { resultsPublishedAt: clock.now() },
  });
  await audit(req, "results.publish", { type: "event", id: eventId, eventId });
  return { resultsPublishedAt: event.resultsPublishedAt?.toISOString() ?? null };
}

export async function unpublishResults(req: Request, eventId: string) {
  await loadEventOrThrow(eventId);
  const event = await prisma.event.update({
    where: { id: eventId },
    data: { resultsPublishedAt: null },
  });
  await audit(req, "results.unpublish", { type: "event", id: eventId, eventId });
  return { resultsPublishedAt: event.resultsPublishedAt };
}

export async function exportCsv(req: Request, eventId: string, type: "results" | "scores") {
  const data = await loadEventNormData(eventId);
  const criterionKeys = data.criteria.map((criterion) => criterion.key);

  if (type === "scores") {
    const header = [
      "judge_id",
      "judge_name",
      "project_id",
      "title",
      "status",
      ...criterionKeys,
      "weighted_total",
      "comment",
      "submitted_at",
    ];
    const judges = await prisma.user.findMany({
      where: { id: { in: [...new Set(data.assignments.map((a) => a.judgeId))] } },
      select: { id: true, name: true },
    });
    const judgeName = new Map(judges.map((judge) => [judge.id, judge.name]));
    const projectTitle = new Map(data.projects.map((project) => [project.id, project.title]));

    const rows = data.assignments.map((assignment) => {
      const scoreMap = Object.fromEntries(
        assignment.scores.map((score) => [score.criterion.key, score.value]),
      );
      const { total } = computeWeightedTotal(
        assignment.scores.map((score) => ({
          criterionKey: score.criterion.key,
          value: score.value,
        })),
        data.criteria,
      );
      return [
        assignment.judgeId,
        judgeName.get(assignment.judgeId) ?? "",
        assignment.projectId,
        projectTitle.get(assignment.projectId) ?? "",
        assignment.status,
        ...criterionKeys.map((key) => scoreMap[key] ?? ""),
        roundDisplay(total) ?? "",
        assignment.comment,
        assignment.submittedAt?.toISOString() ?? "",
      ];
    });

    await audit(req, "export.csv", { type: "event", id: eventId, eventId }, { type });
    return toCsv([header, ...rows]);
  }

  const normalized = normalizeScores(
    buildNormalizationInput({
      criteria: data.criteria,
      assignments: data.assignments,
      projects: data.projects,
      reviewsPerProject: data.event.reviewsPerProject,
    }),
  );
  const trackName = new Map(data.tracks.map((track) => [track.id, track.name]));
  const teamName = new Map(data.projects.map((project) => [project.id, project.team.name]));
  const header = [
    "rank",
    "track",
    "project_id",
    "title",
    "team",
    "review_count",
    "raw_score",
    "normalized_score",
    "flags",
    ...criterionKeys.map((key) => `avg_${key}`),
  ];

  const ranked = [...normalized.projects].sort((a, b) => {
    const trackA = a.trackId ?? "";
    const trackB = b.trackId ?? "";
    if (trackA !== trackB) return trackA.localeCompare(trackB);
    if (a.rank === null && b.rank === null) return a.id.localeCompare(b.id);
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    return (a.rank ?? 0) - (b.rank ?? 0);
  });

  const rows = ranked.map((project) => [
    project.rank ?? "",
    project.trackId ? (trackName.get(project.trackId) ?? "") : "",
    project.id,
    project.title,
    teamName.get(project.id) ?? "",
    project.reviewCount,
    roundDisplay(project.rawScore) ?? "",
    roundDisplay(project.normalizedScore) ?? "",
    project.flags.join("|"),
    ...criterionKeys.map((key) => roundDisplay(project.criterionAverages[key] ?? null) ?? ""),
  ]);

  await audit(req, "export.csv", { type: "event", id: eventId, eventId }, { type });
  return toCsv([header, ...rows]);
}

export async function getDashboard(eventId: string) {
  const data = await loadEventNormData(eventId);
  const normalized = normalizeScores(
    buildNormalizationInput({
      criteria: data.criteria,
      assignments: data.assignments,
      projects: data.projects,
      reviewsPerProject: data.event.reviewsPerProject,
    }),
  );

  const submitted = data.assignments.filter((a) => a.status === "SUBMITTED").length;
  const pending = data.assignments.length - submitted;
  const percentComplete =
    data.assignments.length === 0 ? 0 : (submitted / data.assignments.length) * 100;

  const judges = await prisma.eventRole.findMany({
    where: { eventId, role: EventRoleType.JUDGE },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          assignments: {
            where: { eventId },
            select: { status: true },
          },
        },
      },
    },
  });

  const trackName = new Map(data.tracks.map((track) => [track.id, track.name]));
  const assignedByProject = new Map<string, { assigned: number; submitted: number }>();
  for (const assignment of data.assignments) {
    const current = assignedByProject.get(assignment.projectId) ?? {
      assigned: 0,
      submitted: 0,
    };
    current.assigned += 1;
    if (assignment.status === "SUBMITTED") current.submitted += 1;
    assignedByProject.set(assignment.projectId, current);
  }

  const flags: Array<{ type: string; targetId: string; message: string }> = [];
  for (const judgeId of normalized.flatScorerJudgeIds) {
    const judge = judges.find((row) => row.user.id === judgeId);
    flags.push({
      type: "flat_scorer",
      targetId: judgeId,
      message: `${judge?.user.name ?? judgeId} gave identical scores`,
    });
  }
  for (const project of normalized.projects) {
    if (project.flags.includes("under_reviewed")) {
      flags.push({
        type: "under_reviewed",
        targetId: project.id,
        message: `${project.title} has only ${project.reviewCount} reviews`,
      });
    }
    if (project.flags.includes("duplicate")) {
      flags.push({
        type: "duplicate",
        targetId: project.id,
        message: `${project.title} is marked as a duplicate`,
      });
    }
    const counts = assignedByProject.get(project.id);
    if (!counts || counts.assigned === 0) {
      flags.push({
        type: "unassigned",
        targetId: project.id,
        message: `${project.title} has no assignments`,
      });
    }
  }

  return {
    generatedAt: clock.now().toISOString(),
    totals: {
      projects: data.projects.length,
      assignments: data.assignments.length,
      submitted,
      pending,
      percentComplete: Math.round(percentComplete * 10) / 10,
    },
    judges: judges.map((row) => ({
      id: row.user.id,
      name: row.user.name,
      assigned: row.user.assignments.length,
      submitted: row.user.assignments.filter((a) => a.status === "SUBMITTED").length,
      flatScorer: normalized.flatScorerJudgeIds.includes(row.user.id),
    })),
    projects: data.projects.map((project) => {
      const counts = assignedByProject.get(project.id) ?? { assigned: 0, submitted: 0 };
      return {
        id: project.id,
        title: project.title,
        track: project.trackId ? (trackName.get(project.trackId) ?? null) : null,
        assigned: counts.assigned,
        submitted: counts.submitted,
      };
    }),
    flags,
  };
}

export async function listAudit(
  eventId: string,
  page: number,
  pageSize: number,
) {
  await loadEventOrThrow(eventId);
  const where = { eventId };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { at: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    items: rows.map((row) => ({
      id: row.id,
      at: row.at.toISOString(),
      action: row.action,
      actor: row.actor
        ? { id: row.actor.id, name: row.actor.name, email: row.actor.email }
        : null,
      targetType: row.targetType,
      targetId: row.targetId,
      summary: summarizeAudit(row.action, row.targetType, row.targetId, row.data),
      data: row.data,
    })),
  };
}

function summarizeAudit(
  action: string,
  targetType: string,
  targetId: string | null,
  data: unknown,
): string {
  const target = targetId ? `${targetType} ${targetId}` : targetType;
  switch (action) {
    case "results.publish":
      return "Published results";
    case "results.unpublish":
      return "Unpublished results";
    case "assignment.auto":
      return `Ran auto-assignment (${JSON.stringify(data)})`;
    case "access.denied_peer_scores":
      return `Denied peer score access for ${target}`;
    case "export.csv":
      return `Exported CSV (${JSON.stringify(data)})`;
    default:
      return `${action} on ${target}`;
  }
}
