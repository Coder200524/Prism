import type { Request } from "express";
import { EventRoleType, PlatformRole, ProjectStatus } from "@prisma/client";
import { audit } from "../../lib/audit.js";
import { clock } from "../../lib/clock.js";
import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";

export async function getProjectComments(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { event: true },
  });

  if (!project || project.status !== ProjectStatus.SUBMITTED || !project.event.publishedAt) {
    throw new HttpError(404, "not_found", "Project not found or event not published");
  }

  const comments = await prisma.comment.findMany({
    where: {
      projectId,
      hiddenAt: null,
    },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true } },
    },
  });

  return comments.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt,
    author: {
      id: c.author.id,
      name: c.author.name,
    },
  }));
}

export async function postComment(req: Request, projectId: string, authorId: string, body: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { event: true },
  });

  if (!project || project.status !== ProjectStatus.SUBMITTED || !project.event.publishedAt) {
    throw new HttpError(404, "not_found", "Project not found");
  }

  const normalizedBody = body.toLowerCase().replace(/\s+/g, " ").trim();
  const tenMinutesAgo = new Date(clock.now().getTime() - 10 * 60 * 1000);

  const recentComments = await prisma.comment.findMany({
    where: {
      projectId,
      authorId,
      createdAt: { gte: tenMinutesAgo },
    },
  });

  for (const c of recentComments) {
    const cNormalized = c.body.toLowerCase().replace(/\s+/g, " ").trim();
    if (cNormalized === normalizedBody) {
      throw new HttpError(409, "duplicate_comment", "You recently posted this comment");
    }
  }

  const comment = await prisma.comment.create({
    data: {
      projectId,
      eventId: project.eventId,
      authorId,
      body: body.trim(),
    },
  });

  await audit(req, "comment.create", { type: "Comment", id: comment.id, eventId: project.eventId });

  return { id: comment.id };
}

export async function deleteComment(req: Request, commentId: string, userId: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { author: true },
  });

  if (!comment) {
    throw new HttpError(404, "not_found", "Comment not found");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const roles = await prisma.eventRole.findMany({
    where: { userId, eventId: comment.eventId, role: EventRoleType.ORGANIZER },
  });

  const isAuthor = comment.authorId === userId;
  const isOrganizer = roles.length > 0;
  const isAdmin = user?.platformRole === PlatformRole.ADMIN;

  if (!isAuthor && !isOrganizer && !isAdmin) {
    throw new HttpError(403, "forbidden", "You cannot delete this comment");
  }

  const reason = isAuthor ? "deleted by author" : "deleted by moderator";

  await prisma.comment.update({
    where: { id: commentId },
    data: {
      hiddenAt: clock.now(),
      hiddenById: userId,
      hiddenReason: reason,
    },
  });

  const action = isAuthor ? "comment.delete" : "comment.hide";
  await audit(
    req,
    action,
    { type: "Comment", id: commentId, eventId: comment.eventId },
    { reason }
  );
}

export async function hideComment(req: Request, commentId: string, userId: string, reason: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
  });

  if (!comment) {
    throw new HttpError(404, "not_found", "Comment not found");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const roles = await prisma.eventRole.findMany({
    where: { userId, eventId: comment.eventId, role: EventRoleType.ORGANIZER },
  });

  const isOrganizer = roles.length > 0;
  const isAdmin = user?.platformRole === PlatformRole.ADMIN;

  if (!isOrganizer && !isAdmin) {
    throw new HttpError(403, "forbidden", "You cannot moderate comments");
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: {
      hiddenAt: clock.now(),
      hiddenById: userId,
      hiddenReason: reason,
    },
  });

  await audit(
    req,
    "comment.hide",
    { type: "Comment", id: commentId, eventId: comment.eventId },
    { reason }
  );
}

export async function unhideComment(req: Request, commentId: string, userId: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
  });

  if (!comment) {
    throw new HttpError(404, "not_found", "Comment not found");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const roles = await prisma.eventRole.findMany({
    where: { userId, eventId: comment.eventId, role: EventRoleType.ORGANIZER },
  });

  const isOrganizer = roles.length > 0;
  const isAdmin = user?.platformRole === PlatformRole.ADMIN;

  if (!isOrganizer && !isAdmin) {
    throw new HttpError(403, "forbidden", "You cannot moderate comments");
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: {
      hiddenAt: null,
      hiddenById: null,
      hiddenReason: "",
    },
  });

  await audit(req, "comment.unhide", { type: "Comment", id: commentId, eventId: comment.eventId });
}

export async function getEventComments(eventId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const roles = await prisma.eventRole.findMany({
    where: { userId, eventId, role: EventRoleType.ORGANIZER },
  });

  const isOrganizer = roles.length > 0;
  const isAdmin = user?.platformRole === PlatformRole.ADMIN;

  if (!isOrganizer && !isAdmin) {
    throw new HttpError(403, "forbidden", "You cannot view moderation queue");
  }

  const comments = await prisma.comment.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, name: true } },
      project: { select: { id: true, title: true } },
    },
  });

  return comments.map((c) => ({
    id: c.id,
    projectId: c.projectId,
    projectTitle: c.project.title,
    body: c.body,
    createdAt: c.createdAt,
    author: {
      id: c.author.id,
      name: c.author.name,
    },
    hiddenAt: c.hiddenAt,
    hiddenById: c.hiddenById,
    hiddenReason: c.hiddenReason,
  }));
}
