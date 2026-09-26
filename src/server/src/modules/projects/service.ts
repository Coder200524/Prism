import type { Request } from "express";
import {
  createProjectBodySchema,
  galleryQuerySchema,
  patchProjectBodySchema,
  type CreateProjectBody,
  type GalleryQuery,
  type PatchProjectBody,
} from "@dogfood/shared";
import { ProjectStatus, Prisma } from "@prisma/client";
import { audit } from "../../lib/audit.js";
import { clock } from "../../lib/clock.js";
import {
  conflict,
  forbidden,
  HttpError,
  notFound,
  unauthorized,
} from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { submissionsOpen, isVisible } from "../events/phase.js";
import { submissionsClosedError } from "../events/service.js";
import { findDuplicates } from "./duplicates.js";

function serializeProject(project: {
  id: string;
  eventId: string;
  teamId: string;
  trackId: string | null;
  title: string;
  summary: string;
  repoUrl: string;
  demoUrl: string;
  status: ProjectStatus;
  submittedAt: Date | null;
  duplicateOfId: string | null;
  createdAt: Date;
  updatedAt: Date;
  track?: { id: string; name: string } | null;
  team?: { id: string; name: string };
}) {
  return {
    id: project.id,
    eventId: project.eventId,
    teamId: project.teamId,
    trackId: project.trackId,
    title: project.title,
    summary: project.summary,
    repoUrl: project.repoUrl,
    demoUrl: project.demoUrl,
    status: project.status,
    submittedAt: project.submittedAt?.toISOString() ?? null,
    duplicateOfId: project.duplicateOfId,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    trackName: project.track?.name ?? null,
    teamName: project.team?.name ?? null,
  };
}

async function assertTeamMember(userId: string, teamId: string) {
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!membership) {
    throw forbidden("forbidden", "Not a team member");
  }
  return membership;
}

async function runDuplicateDetection(eventId: string): Promise<void> {
  const projects = await prisma.project.findMany({
    where: { eventId, status: ProjectStatus.SUBMITTED },
    select: { id: true, title: true, repoUrl: true, submittedAt: true, duplicateCleared: true },
  });
  const duplicateMap = findDuplicates(projects);
  for (const project of projects) {
    let duplicateOfId = duplicateMap.get(project.id) ?? null;
    if (project.duplicateCleared) {
      duplicateOfId = null;
    }
    await prisma.project.update({
      where: { id: project.id },
      data: { duplicateOfId },
    });
  }
}

export async function listGallery(query: GalleryQuery) {
  const parsed = galleryQuerySchema.parse(query);
  const where: Prisma.ProjectWhereInput = {
    status: ProjectStatus.SUBMITTED,
    event: { publishedAt: { not: null } },
    ...(parsed.eventId ? { eventId: parsed.eventId } : {}),
    ...(parsed.trackId ? { trackId: parsed.trackId } : {}),
    ...(parsed.q
      ? {
          OR: [
            { title: { contains: parsed.q, mode: "insensitive" } },
            { summary: { contains: parsed.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      include: {
        track: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      skip: (parsed.page - 1) * parsed.pageSize,
      take: parsed.pageSize,
    }),
  ]);

  return {
    items: items.map(serializeProject),
    total,
    page: parsed.page,
    pageSize: parsed.pageSize,
  };
}

export async function getProject(req: Request, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      track: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
  });
  if (!project) throw notFound("Project not found");

  if (project.status !== ProjectStatus.SUBMITTED) {
    if (!req.user) throw notFound("Project not found");
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: project.teamId, userId: req.user.id } },
    });
    if (!membership && req.user.platformRole !== "ADMIN") {
      throw notFound("Project not found");
    }
  }

  return { project: serializeProject(project) };
}

export async function createProject(req: Request) {
  if (!req.user) throw unauthorized();

  const rawBody = (req.body ?? {}) as Record<string, unknown>;
  let eventId =
    typeof rawBody.eventId === "string" && rawBody.eventId.length > 0
      ? rawBody.eventId
      : undefined;

  if (!eventId) {
    const memberships = await prisma.teamMember.findMany({
      where: { userId: req.user.id },
      select: { eventId: true, teamId: true },
    });
    const uniqueEvents = [...new Set(memberships.map((m) => m.eventId))];
    if (uniqueEvents.length !== 1 || !uniqueEvents[0]) {
      throw new HttpError(400, "event_required", "eventId is required when you are on multiple teams");
    }
    eventId = uniqueEvents[0];
  }

  const resolvedEventId = eventId;

  const event = await prisma.event.findUnique({ where: { id: resolvedEventId } });
  if (!event || !isVisible(event)) throw notFound("Event not found");

  const now = clock.now();
  if (!submissionsOpen(event, now)) {
    await audit(
      req,
      "project.submit_refused_deadline",
      { type: "event", id: event.id, eventId: event.id },
      { action: "create" },
    );
    throw submissionsClosedError(event.submissionsClose);
  }

  const membership = await prisma.teamMember.findUnique({
    where: { eventId_userId: { eventId: resolvedEventId, userId: req.user.id } },
  });
  if (!membership) {
    throw forbidden("not_a_participant", "You must be on a team for this event");
  }

  const existingProject = await prisma.project.findUnique({
    where: { teamId: membership.teamId },
    select: { id: true },
  });
  if (existingProject) {
    throw conflict("project_exists", "This team already has a project");
  }

  const body: CreateProjectBody = createProjectBodySchema.parse(rawBody);

  if (body.trackId) {
    const track = await prisma.track.findFirst({
      where: { id: body.trackId, eventId: resolvedEventId },
      select: { id: true },
    });
    if (!track) {
      throw new HttpError(400, "bad_request", "trackId does not belong to this event");
    }
  }

  const project = await prisma.project.create({
    data: {
      eventId: resolvedEventId,
      teamId: membership.teamId,
      title: body.title,
      summary: body.summary,
      repoUrl: body.repoUrl,
      demoUrl: body.demoUrl,
      trackId: body.trackId ?? null,
      status: ProjectStatus.DRAFT,
    },
    include: {
      track: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
  });

  await audit(req, "project.create", {
    type: "project",
    id: project.id,
    eventId: resolvedEventId,
  });
  return { project: serializeProject(project) };
}

export async function updateProject(req: Request, projectId: string) {
  if (!req.user) throw unauthorized();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { event: true },
  });
  if (!project) throw notFound("Project not found");

  const now = clock.now();
  if (!submissionsOpen(project.event, now)) {
    await audit(
      req,
      "project.submit_refused_deadline",
      { type: "project", id: projectId, eventId: project.eventId },
      { action: "edit" },
    );
    throw submissionsClosedError(project.event.submissionsClose);
  }

  await assertTeamMember(req.user.id, project.teamId);

  const body: PatchProjectBody = patchProjectBodySchema.parse(req.body ?? {});

  if (body.trackId) {
    const track = await prisma.track.findFirst({
      where: { id: body.trackId, eventId: project.eventId },
      select: { id: true },
    });
    if (!track) {
      throw new HttpError(400, "bad_request", "trackId does not belong to this event");
    }
  }

  if (project.status === ProjectStatus.SUBMITTED) {
    const updatedTitle = body.title ?? project.title;
    const updatedSummary = body.summary ?? project.summary;
    const updatedTrackId = body.trackId !== undefined ? body.trackId : project.trackId;
    const updatedRepoUrl = body.repoUrl ?? project.repoUrl;
    if (!updatedTitle.trim() || !updatedSummary.trim() || !updatedTrackId || !updatedRepoUrl.trim()) {
      throw new HttpError(400, "incomplete_project", "title, summary, trackId and repoUrl are required for submitted projects");
    }
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.summary !== undefined ? { summary: body.summary } : {}),
      ...(body.repoUrl !== undefined ? { repoUrl: body.repoUrl } : {}),
      ...(body.demoUrl !== undefined ? { demoUrl: body.demoUrl } : {}),
      ...(body.trackId !== undefined ? { trackId: body.trackId } : {}),
    },
    include: {
      track: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
  });

  await audit(req, "project.update", { type: "project", id: projectId, eventId: project.eventId });
  return { project: serializeProject(updated) };
}

export async function submitProject(req: Request, projectId: string) {
  if (!req.user) throw unauthorized();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { event: true },
  });
  if (!project) throw notFound("Project not found");

  const now = clock.now();
  if (!submissionsOpen(project.event, now)) {
    await audit(
      req,
      "project.submit_refused_deadline",
      { type: "project", id: projectId, eventId: project.eventId },
      { action: "submit" },
    );
    throw submissionsClosedError(project.event.submissionsClose);
  }

  await assertTeamMember(req.user.id, project.teamId);

  const rawBody = (req.body ?? {}) as Record<string, unknown>;
  let newTrackId = project.trackId;
  if (rawBody.trackId !== undefined) {
    newTrackId = rawBody.trackId === null ? null : String(rawBody.trackId);
    if (newTrackId) {
      const track = await prisma.track.findFirst({
        where: { id: newTrackId, eventId: project.eventId },
      });
      if (!track) {
        throw new HttpError(400, "bad_request", "trackId does not belong to this event");
      }
    }
  }

  if (!project.title.trim() || !project.summary.trim() || !newTrackId || !project.repoUrl.trim()) {
    throw new HttpError(
      400,
      "incomplete_project",
      "title, summary, trackId and repoUrl are required to submit",
    );
  }

  const submittedAt = project.submittedAt ?? now;
  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      status: ProjectStatus.SUBMITTED,
      submittedAt,
      trackId: newTrackId,
    },
    include: {
      track: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
  });

  await runDuplicateDetection(project.eventId);
  await audit(req, "project.submit", { type: "project", id: projectId, eventId: project.eventId });

  const refreshed = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      track: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
  });

  return { project: serializeProject(refreshed ?? updated) };
}

export async function clearDuplicate(req: Request, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound("Project not found");

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { duplicateOfId: null, duplicateCleared: true },
    include: {
      track: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
  });

  await audit(req, "project.clear_duplicate", {
    type: "project",
    id: projectId,
    eventId: project.eventId,
  });
  return { project: serializeProject(updated) };
}
