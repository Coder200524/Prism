import type { Request } from "express";
import type { CreateEventBody, CreatePrizeBody, CreateTrackBody, PatchEventBody, PatchPrizeBody, PatchTrackBody } from "@dogfood/shared";
import { EventRoleType } from "@prisma/client";
import { audit } from "../../lib/audit.js";
import { clock } from "../../lib/clock.js";
import { badRequest, conflict, forbidden, HttpError, notFound } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { phase as computePhase } from "./phase.js";

function parseDate(value: string): Date {
  return new Date(value);
}

function assertTimeline(
  submissionsOpen: Date,
  submissionsClose: Date,
  judgingClose: Date | null,
  votingOpen: Date | null,
  votingClose: Date | null,
): void {
  if (!(submissionsOpen < submissionsClose)) {
    throw badRequest("submissionsOpen must be before submissionsClose");
  }
  if (judgingClose !== null && !(submissionsClose <= judgingClose)) {
    throw badRequest("submissionsClose must be on or before judgingClose");
  }
  if (votingOpen !== null && votingClose !== null) {
    if (!(votingOpen < votingClose)) {
      throw badRequest("votingOpen must be before votingClose");
    }
    if (!(submissionsClose <= votingOpen)) {
      throw badRequest("votingOpen must be on or after submissionsClose");
    }
  } else if (votingOpen !== null || votingClose !== null) {
    throw badRequest("votingOpen and votingClose must both be provided or both be omitted");
  }
}

function serializeEvent(
  event: {
    id: string;
    name: string;
    description: string;
    submissionsOpen: Date;
    submissionsClose: Date;
    judgingClose: Date | null;
    votingOpen: Date | null;
    votingClose: Date | null;
    publishedAt: Date | null;
    resultsPublishedAt: Date | null;
    maxTeamSize: number;
    reviewsPerProject: number;
    createdAt: Date;
    tracks?: Array<{
      id: string;
      eventId: string;
      name: string;
      description: string;
    }>;
    prizes?: Array<{
      id: string;
      eventId: string;
      trackId: string | null;
      name: string;
      description: string;
      value: string;
      place: number | null;
    }>;
  },
  now = clock.now(),
) {
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    submissionsOpen: event.submissionsOpen.toISOString(),
    submissionsClose: event.submissionsClose.toISOString(),
    judgingClose: event.judgingClose?.toISOString() ?? null,
    votingOpen: event.votingOpen?.toISOString() ?? null,
    votingClose: event.votingClose?.toISOString() ?? null,
    publishedAt: event.publishedAt?.toISOString() ?? null,
    resultsPublishedAt: event.resultsPublishedAt?.toISOString() ?? null,
    maxTeamSize: event.maxTeamSize,
    reviewsPerProject: event.reviewsPerProject,
    createdAt: event.createdAt.toISOString(),
    phase: computePhase(event, now),
    tracks: event.tracks ?? [],
    prizes: event.prizes ?? [],
  };
}

async function isEventOrganizer(userId: string, eventId: string, platformRole: string): Promise<boolean> {
  if (platformRole === "ADMIN") return true;
  const role = await prisma.eventRole.findUnique({
    where: {
      userId_eventId_role: { userId, eventId, role: EventRoleType.ORGANIZER },
    },
    select: { id: true },
  });
  return Boolean(role);
}

export async function listEvents(req: Request) {
  const user = req.user;
  const events = await prisma.event.findMany({
    where: user
      ? {
          OR: [
            { publishedAt: { not: null } },
            {
              roles: {
                some: {
                  userId: user.id,
                  role: EventRoleType.ORGANIZER,
                },
              },
            },
            ...(user.platformRole === "ADMIN" ? [{}] : []),
          ],
        }
      : { publishedAt: { not: null } },
    include: {
      tracks: { orderBy: { name: "asc" } },
      prizes: { orderBy: [{ place: "asc" }, { name: "asc" }] },
    },
    orderBy: { submissionsOpen: "desc" },
  });

  return { events: events.map((event) => serializeEvent(event)) };
}

export async function getEvent(req: Request, eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      tracks: { orderBy: { name: "asc" } },
      prizes: { orderBy: [{ place: "asc" }, { name: "asc" }] },
    },
  });
  if (!event) throw notFound("Event not found");

  if (event.publishedAt === null) {
    if (!req.user || !(await isEventOrganizer(req.user.id, eventId, req.user.platformRole))) {
      throw notFound("Event not found");
    }
  }

  return { event: serializeEvent(event) };
}

export async function createEvent(req: Request, body: CreateEventBody) {
  if (!req.user) throw forbidden("forbidden", "Authentication required");

  const submissionsOpen = parseDate(body.submissionsOpen);
  const submissionsClose = parseDate(body.submissionsClose);
  const judgingClose = body.judgingClose ? parseDate(body.judgingClose) : null;
  const votingOpen = body.votingOpen ? parseDate(body.votingOpen) : null;
  const votingClose = body.votingClose ? parseDate(body.votingClose) : null;
  assertTimeline(submissionsOpen, submissionsClose, judgingClose, votingOpen, votingClose);

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        name: body.name,
        description: body.description,
        submissionsOpen,
        submissionsClose,
        judgingClose,
        votingOpen,
        votingClose,
        maxTeamSize: body.maxTeamSize,
        reviewsPerProject: body.reviewsPerProject,
        tracks: {
          create: body.tracks.map((track) => ({
            name: track.name,
            description: track.description,
          })),
        },
        roles: {
          create: {
            userId: req.user!.id,
            role: EventRoleType.ORGANIZER,
          },
        },
      },
      include: {
        tracks: true,
        prizes: true,
      },
    });

    if (body.prizes.length > 0) {
      await tx.prize.createMany({
        data: body.prizes.map((prize) => ({
          eventId: created.id,
          name: prize.name,
          description: prize.description,
          value: prize.value,
          place: prize.place ?? null,
          trackId: prize.trackId ?? null,
        })),
      });
    }

    return tx.event.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        tracks: { orderBy: { name: "asc" } },
        prizes: { orderBy: [{ place: "asc" }, { name: "asc" }] },
      },
    });
  });

  await audit(req, "event.create", { type: "event", id: event.id, eventId: event.id }, {
    name: event.name,
  });

  return { event: serializeEvent(event) };
}

export async function updateEvent(req: Request, eventId: string, body: PatchEventBody) {
  const existing = await prisma.event.findUnique({ where: { id: eventId } });
  if (!existing) throw notFound("Event not found");

  const submissionsOpen = body.submissionsOpen
    ? parseDate(body.submissionsOpen)
    : existing.submissionsOpen;
  const submissionsClose = body.submissionsClose
    ? parseDate(body.submissionsClose)
    : existing.submissionsClose;
  const judgingClose =
    body.judgingClose === undefined
      ? existing.judgingClose
      : body.judgingClose === null
        ? null
        : parseDate(body.judgingClose);
  const votingOpen =
    body.votingOpen === undefined
      ? existing.votingOpen
      : body.votingOpen === null
        ? null
        : parseDate(body.votingOpen);
  const votingClose =
    body.votingClose === undefined
      ? existing.votingClose
      : body.votingClose === null
        ? null
        : parseDate(body.votingClose);
  assertTimeline(submissionsOpen, submissionsClose, judgingClose, votingOpen, votingClose);

  const event = await prisma.event.update({
    where: { id: eventId },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      submissionsOpen,
      submissionsClose,
      judgingClose,
      votingOpen,
      votingClose,
      ...(body.maxTeamSize !== undefined ? { maxTeamSize: body.maxTeamSize } : {}),
      ...(body.reviewsPerProject !== undefined
        ? { reviewsPerProject: body.reviewsPerProject }
        : {}),
    },
    include: {
      tracks: { orderBy: { name: "asc" } },
      prizes: { orderBy: [{ place: "asc" }, { name: "asc" }] },
    },
  });

  await audit(req, "event.update", { type: "event", id: eventId, eventId }, body as Record<string, unknown>);
  return { event: serializeEvent(event) };
}

export async function publishEvent(req: Request, eventId: string) {
  const existing = await prisma.event.findUnique({ where: { id: eventId } });
  if (!existing) throw notFound("Event not found");

  const event = await prisma.event.update({
    where: { id: eventId },
    data: { publishedAt: clock.now() },
    include: {
      tracks: { orderBy: { name: "asc" } },
      prizes: { orderBy: [{ place: "asc" }, { name: "asc" }] },
    },
  });

  await audit(req, "event.publish", { type: "event", id: eventId, eventId });
  return { event: serializeEvent(event) };
}

export async function createTrack(req: Request, eventId: string, body: CreateTrackBody) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) throw notFound("Event not found");

  try {
    const track = await prisma.track.create({
      data: {
        eventId,
        name: body.name,
        description: body.description,
      },
    });
    await audit(req, "event.track.create", { type: "track", id: track.id, eventId }, {
      name: track.name,
    });
    return { track };
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code: string }).code === "P2002") {
      throw conflict("track_exists", "A track with this name already exists");
    }
    throw error;
  }
}

export async function updateTrack(
  req: Request,
  eventId: string,
  trackId: string,
  body: PatchTrackBody,
) {
  const track = await prisma.track.findFirst({ where: { id: trackId, eventId } });
  if (!track) throw notFound("Track not found");

  try {
    const updated = await prisma.track.update({
      where: { id: trackId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
    });
    await audit(req, "event.track.update", { type: "track", id: trackId, eventId }, body as Record<string, unknown>);
    return { track: updated };
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code: string }).code === "P2002") {
      throw conflict("track_exists", "A track with this name already exists");
    }
    throw error;
  }
}

export async function deleteTrack(req: Request, eventId: string, trackId: string) {
  const track = await prisma.track.findFirst({ where: { id: trackId, eventId } });
  if (!track) throw notFound("Track not found");

  const inUse = await prisma.project.count({ where: { trackId } });
  if (inUse > 0) {
    throw conflict("track_in_use", "Track is used by one or more projects");
  }

  await prisma.track.delete({ where: { id: trackId } });
  await audit(req, "event.track.delete", { type: "track", id: trackId, eventId });
}

export async function createPrize(req: Request, eventId: string, body: CreatePrizeBody) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) throw notFound("Event not found");

  if (body.trackId) {
    const track = await prisma.track.findFirst({ where: { id: body.trackId, eventId } });
    if (!track) throw badRequest("trackId does not belong to this event");
  }

  const prize = await prisma.prize.create({
    data: {
      eventId,
      name: body.name,
      description: body.description,
      value: body.value,
      place: body.place ?? null,
      trackId: body.trackId ?? null,
    },
  });
  await audit(req, "event.prize.create", { type: "prize", id: prize.id, eventId });
  return { prize };
}

export async function updatePrize(
  req: Request,
  eventId: string,
  prizeId: string,
  body: PatchPrizeBody,
) {
  const prize = await prisma.prize.findFirst({ where: { id: prizeId, eventId } });
  if (!prize) throw notFound("Prize not found");

  if (body.trackId) {
    const track = await prisma.track.findFirst({ where: { id: body.trackId, eventId } });
    if (!track) throw badRequest("trackId does not belong to this event");
  }

  const updated = await prisma.prize.update({
    where: { id: prizeId },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.value !== undefined ? { value: body.value } : {}),
      ...(body.place !== undefined ? { place: body.place } : {}),
      ...(body.trackId !== undefined ? { trackId: body.trackId } : {}),
    },
  });
  await audit(req, "event.prize.update", { type: "prize", id: prizeId, eventId }, body as Record<string, unknown>);
  return { prize: updated };
}

export async function deletePrize(req: Request, eventId: string, prizeId: string) {
  const prize = await prisma.prize.findFirst({ where: { id: prizeId, eventId } });
  if (!prize) throw notFound("Prize not found");
  await prisma.prize.delete({ where: { id: prizeId } });
  await audit(req, "event.prize.delete", { type: "prize", id: prizeId, eventId });
}

export function submissionsClosedError(closeAt: Date): HttpError {
  return new HttpError(
    403,
    "submissions_closed",
    `Submissions closed at ${closeAt.toISOString()}.`,
  );
}
