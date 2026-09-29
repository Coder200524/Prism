import type { NextFunction, Request, Response } from "express";
import { PlatformRole } from "@prisma/client";
import rateLimit from "express-rate-limit";
import { resolveRequestEventId } from "../lib/api-key-scope.js";
import { clock } from "../lib/clock.js";
import { forbidden } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { hashToken } from "../lib/tokens.js";

export const apiKeyRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: () => (process.env.TEST_RATE_LIMIT === "1" ? 3 : process.env.NODE_ENV === "test" ? 10_000 : 120),
  keyGenerator: (req) => req.apiKey?.id || req.ip || "unknown",
  skip: (req) => !req.apiKey,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  message: {
    error: {
      code: "rate_limited",
      message: "API key rate limit exceeded (120 requests per minute)",
    },
  },
});

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    next();
    return;
  }

  if (token.startsWith("dfk_")) {
    const keyHash = hashToken(token);
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
            platformRole: true,
            createdAt: true,
          },
        },
      },
    });

    if (!apiKey || apiKey.revokedAt !== null) {
      next();
      return;
    }

    // Check scope: "read" scope permits GET and HEAD only
    if (req.method !== "GET" && req.method !== "HEAD" && !apiKey.scopes.includes("write")) {
      next(forbidden("insufficient_scope", "API key does not have write scope"));
      return;
    }

    // Update lastUsedAt asynchronously
    prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: clock.now() },
      })
      .catch(() => {});

    req.user = { ...apiKey.owner, platformRole: PlatformRole.USER };
    req.apiKey = {
      id: apiKey.id,
      eventId: apiKey.eventId,
      ownerId: apiKey.ownerId,
      name: apiKey.name,
      prefix: apiKey.prefix,
      scopes: apiKey.scopes,
    };

    // API keys are explicitly blocked from managing API keys
    if (req.path.includes("/api-keys")) {
      next(forbidden("api_key_scope", "API keys cannot manage other API keys"));
      return;
    }

    // Enforce event scope against URL, query, body, and ID-based resources.
    try {
      const targetEventId = await resolveRequestEventId(req);
      if (!targetEventId) {
        next(forbidden("api_key_scope", "API keys must target a specific event"));
        return;
      }

      if (apiKey.eventId) {
        if (targetEventId !== apiKey.eventId) {
          next(forbidden("api_key_scope", `API key is scoped to event ${apiKey.eventId}`));
          return;
        }
      } else {
        const isOrg = await prisma.eventRole.findUnique({
          where: {
            userId_eventId_role: { userId: apiKey.ownerId, eventId: targetEventId, role: "ORGANIZER" }
          }
        });
        if (!isOrg) {
          next(forbidden("api_key_scope", `API key owner is not an organizer of event ${targetEventId}`));
          return;
        }
      }
    } catch (err) {
      next(err);
      return;
    }

    next();
    return;
  }

  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          platformRole: true,
          createdAt: true,
        },
      },
    },
  });

  if (!session || session.expiresAt <= clock.now()) {
    next();
    return;
  }

  req.user = session.user;
  req.session = { id: session.id, tokenHash: session.tokenHash };
  next();
}
