import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import { clock } from "./clock.js";
import { prisma } from "./prisma.js";

export type AuditTarget = {
  type: string;
  id?: string;
  eventId?: string;
};

export async function audit(
  req: Request,
  action: string,
  target: AuditTarget,
  data?: Record<string, unknown>,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      at: clock.now(),
      actorId: req.user?.id ?? null,
      eventId: target.eventId ?? null,
      action,
      targetType: target.type,
      targetId: target.id ?? null,
      data: (data as Prisma.InputJsonValue | undefined) ?? undefined,
      ip: req.ip ?? null,
    },
  });
}
