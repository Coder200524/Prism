import type { EventRoleType, PlatformRole } from "@prisma/client";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { forbidden, unauthorized } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(unauthorized());
    return;
  }
  next();
}

export function requirePlatformRole(...roles: PlatformRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(unauthorized());
      return;
    }
    if (req.user.platformRole === "ADMIN" || roles.includes(req.user.platformRole)) {
      next();
      return;
    }
    next(forbidden("forbidden", "Insufficient platform role"));
  };
}

export function requireEventRole(
  role: EventRoleType,
  eventIdFrom: (req: Request) => string,
): RequestHandler {
  return requireAnyEventRole([role], eventIdFrom);
}

export function requireAnyEventRole(
  roles: EventRoleType[],
  eventIdFrom: (req: Request) => string,
): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) {
      next(unauthorized());
      return;
    }
    if (req.user.platformRole === "ADMIN") {
      next();
      return;
    }

    const eventId = eventIdFrom(req);
    const match = await prisma.eventRole.findFirst({
      where: {
        userId: req.user.id,
        eventId,
        role: { in: roles },
      },
      select: { id: true },
    });

    if (!match) {
      next(forbidden("forbidden", `Requires one of event roles: ${roles.join(", ")}`));
      return;
    }
    next();
  };
}
