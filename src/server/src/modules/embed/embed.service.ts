import { ProjectStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export async function getEmbedGallery(query: {
  eventId?: string;
  trackId?: string;
  theme?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 50);

  const projects = await prisma.project.findMany({
    where: {
      status: ProjectStatus.SUBMITTED,
      duplicateOfId: null,
      event: {
        resultsPublishedAt: { not: null },
        ...(query.eventId ? { id: query.eventId } : {}),
      },
      ...(query.trackId ? { trackId: query.trackId } : {}),
    },
    select: {
      id: true,
      title: true,
      summary: true,
      repoUrl: true,
      demoUrl: true,
      submittedAt: true,
      team: { select: { name: true } },
      track: { select: { id: true, name: true } },
      event: { select: { id: true, name: true } },
    },
    orderBy: { submittedAt: "desc" },
    take: limit,
  });

  return {
    theme: query.theme === "dark" ? "dark" : "light",
    projects: projects.map((p) => ({
      id: p.id,
      title: p.title,
      summary: p.summary,
      repoUrl: p.repoUrl,
      demoUrl: p.demoUrl,
      submittedAt: p.submittedAt?.toISOString() ?? null,
      teamName: p.team.name,
      trackId: p.track?.id ?? null,
      trackName: p.track?.name ?? null,
      eventId: p.event.id,
      eventName: p.event.name,
    })),
  };
}

export function isValidResizeMessage(
  event: { origin: string; data: unknown },
  expectedOrigin: string,
): boolean {
  if (expectedOrigin !== "*" && event.origin !== expectedOrigin) {
    return false;
  }
  if (!event.data || typeof event.data !== "object") {
    return false;
  }
  const payload = event.data as Record<string, unknown>;
  if (payload.type !== "dogfood:resize") {
    return false;
  }
  return typeof payload.height === "number" && payload.height >= 0;
}
