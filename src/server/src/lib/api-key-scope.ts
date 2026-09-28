import type { Request } from "express";
import { forbidden } from "./http-error.js";
import { prisma } from "./prisma.js";

/**
 * Event-scoped API keys (dfk_ with eventId set) may only touch that event.
 * Call whenever the target event is known — never rely on URL shape alone.
 */
export function assertApiKeyEventScope(
  req: Request,
  eventId: string | null | undefined,
): void {
  const scoped = req.apiKey?.eventId;
  if (!scoped) return;
  if (!eventId || eventId !== scoped) {
    throw forbidden(
      "event_mismatch",
      `API key is scoped to event ${scoped}`,
    );
  }
}

function pathSegment(url: string, pattern: RegExp): string | null {
  const match = url.match(pattern);
  return match?.[1] ?? null;
}

/**
 * Resolve the event that owns a path/query/body resource for event-scoped API keys.
 * Parses the URL directly because authenticate runs before route params are set.
 * Returns null when the request has no event-bound resource (e.g. /api/health).
 */
export async function resolveRequestEventId(req: Request): Promise<string | null> {
  const url = req.originalUrl.split("?")[0] ?? req.originalUrl;
  const query = req.query as Record<string, unknown>;

  const eventFromPath = pathSegment(url, /\/api\/events\/([^/]+)/);
  if (eventFromPath) return eventFromPath;

  if (typeof query.eventId === "string" && query.eventId.length > 0) {
    return query.eventId;
  }

  const projectId = pathSegment(url, /\/api\/projects\/([^/]+)/);
  if (projectId) {
    const row = await prisma.project.findUnique({
      where: { id: projectId },
      select: { eventId: true },
    });
    return row?.eventId ?? null;
  }

  const teamId = pathSegment(url, /\/api\/teams\/([^/]+)/);
  if (teamId && teamId !== "mine" && teamId !== "invite") {
    const row = await prisma.team.findUnique({
      where: { id: teamId },
      select: { eventId: true },
    });
    return row?.eventId ?? null;
  }

  const assignmentId = pathSegment(url, /\/api\/assignments\/([^/]+)/);
  if (assignmentId) {
    const row = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { eventId: true },
    });
    return row?.eventId ?? null;
  }

  const judgeAssignmentId = pathSegment(url, /\/api\/judge\/assignments\/([^/]+)/);
  if (judgeAssignmentId) {
    const row = await prisma.assignment.findUnique({
      where: { id: judgeAssignmentId },
      select: { eventId: true },
    });
    return row?.eventId ?? null;
  }

  const webhookId = pathSegment(url, /\/api\/webhooks\/([^/]+)/);
  if (webhookId) {
    const row = await prisma.webhook.findUnique({
      where: { id: webhookId },
      select: { eventId: true },
    });
    return row?.eventId ?? null;
  }

  const deliveryId = pathSegment(url, /\/api\/webhook-deliveries\/([^/]+)/);
  if (deliveryId) {
    const row = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: { select: { eventId: true } } },
    });
    return row?.webhook.eventId ?? null;
  }

  const recordId = pathSegment(url, /\/api\/records\/([^/]+)/);
  if (recordId) {
    const row = await prisma.record.findUnique({
      where: { id: recordId },
      select: { eventId: true },
    });
    return row?.eventId ?? null;
  }

  if (url === "/api/import" || url.startsWith("/api/import?")) {
    const body = req.body as { event?: { id?: string } } | undefined;
    if (body?.event?.id) return body.event.id;
  }

  return null;
}
