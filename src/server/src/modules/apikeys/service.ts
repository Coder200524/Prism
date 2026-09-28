import crypto from "node:crypto";
import type { Request } from "express";
import type { CreateApiKeyBody } from "@dogfood/shared";
import { audit } from "../../lib/audit.js";
import { assertApiKeyEventScope } from "../../lib/api-key-scope.js";
import { clock } from "../../lib/clock.js";
import { forbidden, notFound, unauthorized } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { hashToken } from "../../lib/tokens.js";

export async function createApiKey(req: Request, eventId: string, body: CreateApiKeyBody) {
  if (!req.user) throw unauthorized();

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw notFound("Event not found");

  const rawBytes = crypto.randomBytes(32).toString("base64url");
  const key = `dfk_${rawBytes}`;
  const prefix = key.slice(0, 8);
  const keyHash = hashToken(key);

  const apiKey = await prisma.apiKey.create({
    data: {
      eventId,
      ownerId: req.user.id,
      name: body.name,
      prefix,
      keyHash,
      scopes: body.scopes,
    },
  });

  await audit(
    req,
    "api_key.create",
    { type: "api_key", id: apiKey.id, eventId },
    { name: apiKey.name, prefix: apiKey.prefix, scopes: apiKey.scopes },
  );

  return {
    id: apiKey.id,
    eventId: apiKey.eventId,
    ownerId: apiKey.ownerId,
    name: apiKey.name,
    prefix: apiKey.prefix,
    scopes: apiKey.scopes,
    key,
    createdAt: apiKey.createdAt,
  };
}

export async function listApiKeys(req: Request, eventId: string) {
  if (!req.user) throw unauthorized();

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw notFound("Event not found");

  const keys = await prisma.apiKey.findMany({
    where: { eventId },
    select: {
      id: true,
      eventId: true,
      ownerId: true,
      name: true,
      prefix: true,
      scopes: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return { apiKeys: keys };
}

export async function revokeApiKey(req: Request, id: string) {
  if (!req.user) throw unauthorized();

  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key) throw notFound("API key not found");

  // Event-scoped callers may only revoke keys for their own event (not global/other).
  assertApiKeyEventScope(req, key.eventId);

  if (req.user.platformRole !== "ADMIN" && key.ownerId !== req.user.id) {
    if (key.eventId) {
      const isOrganizer = await prisma.eventRole.findFirst({
        where: { userId: req.user.id, eventId: key.eventId, role: "ORGANIZER" },
      });
      if (!isOrganizer) {
        throw forbidden("forbidden", "Cannot revoke this API key");
      }
    } else {
      throw forbidden("forbidden", "Cannot revoke this API key");
    }
  }

  const updated = await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: clock.now() },
  });

  await audit(
    req,
    "api_key.revoke",
    { type: "api_key", id: key.id, eventId: key.eventId ?? undefined },
    { name: key.name },
  );

  return {
    id: updated.id,
    revokedAt: updated.revokedAt,
  };
}
