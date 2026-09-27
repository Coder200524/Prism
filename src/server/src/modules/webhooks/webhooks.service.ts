import type { Request } from "express";
import crypto from "node:crypto";
import { config } from "../../config.js";
import { audit } from "../../lib/audit.js";
import { clock } from "../../lib/clock.js";
import { badRequest, notFound } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { decryptPrivateKey, encryptPrivateKey } from "../records/crypto.js";
import { validateWebhookUrl } from "./ssrf.js";

const RETRY_BACKOFF_MS = [
  1 * 60 * 1000,       // 1 min
  5 * 60 * 1000,       // 5 min
  30 * 60 * 1000,      // 30 min
  2 * 60 * 60 * 1000,  // 2 hours
  6 * 60 * 60 * 1000,  // 6 hours
];

export async function createWebhook(
  req: Request,
  eventId: string,
  body: { url: string; events: string[]; secret?: string },
) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw notFound("Event not found");

  const ssrfCheck = await validateWebhookUrl(body.url);
  if (!ssrfCheck.allowed) {
    throw badRequest(`Webhook URL validation failed: ${ssrfCheck.reason}`);
  }

  const rawSecret = body.secret || `whsec_${crypto.randomBytes(24).toString("hex")}`;
  const encryptedSecret = encryptPrivateKey(rawSecret, config.SIGNING_KEY_SECRET);

  const webhook = await prisma.webhook.create({
    data: {
      eventId,
      url: body.url,
      secret: encryptedSecret,
      events: body.events,
      active: true,
      createdById: req.user!.id,
      createdAt: clock.now(),
    },
  });

  await audit(
    req,
    "webhook.create",
    { type: "webhook", id: webhook.id, eventId },
    { url: webhook.url, events: webhook.events },
  );

  return {
    webhook: {
      id: webhook.id,
      eventId: webhook.eventId,
      url: webhook.url,
      events: webhook.events,
      active: webhook.active,
      createdById: webhook.createdById,
      createdAt: webhook.createdAt.toISOString(),
      secret: rawSecret,
    },
  };
}

export async function listWebhooks(eventId: string) {
  const webhooks = await prisma.webhook.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
  });

  return {
    webhooks: webhooks.map((w) => ({
      id: w.id,
      eventId: w.eventId,
      url: w.url,
      events: w.events,
      active: w.active,
      createdById: w.createdById,
      createdAt: w.createdAt.toISOString(),
    })),
  };
}

export async function getWebhook(webhookId: string) {
  const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook) throw notFound("Webhook not found");

  return {
    webhook: {
      id: webhook.id,
      eventId: webhook.eventId,
      url: webhook.url,
      events: webhook.events,
      active: webhook.active,
      createdById: webhook.createdById,
      createdAt: webhook.createdAt.toISOString(),
    },
  };
}

export async function updateWebhook(
  req: Request,
  webhookId: string,
  body: { url?: string; events?: string[]; active?: boolean },
) {
  const existing = await prisma.webhook.findUnique({ where: { id: webhookId } });
  if (!existing) throw notFound("Webhook not found");

  if (body.url) {
    const ssrfCheck = await validateWebhookUrl(body.url);
    if (!ssrfCheck.allowed) {
      throw badRequest(`Webhook URL validation failed: ${ssrfCheck.reason}`);
    }
  }

  const updated = await prisma.webhook.update({
    where: { id: webhookId },
    data: {
      ...(body.url !== undefined ? { url: body.url } : {}),
      ...(body.events !== undefined ? { events: body.events } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    },
  });

  await audit(
    req,
    "webhook.update",
    { type: "webhook", id: webhookId, eventId: existing.eventId },
    body,
  );

  return {
    webhook: {
      id: updated.id,
      eventId: updated.eventId,
      url: updated.url,
      events: updated.events,
      active: updated.active,
      createdById: updated.createdById,
      createdAt: updated.createdAt.toISOString(),
    },
  };
}

export async function deleteWebhook(req: Request, webhookId: string) {
  const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook) throw notFound("Webhook not found");

  await prisma.webhook.delete({ where: { id: webhookId } });

  await audit(req, "webhook.delete", {
    type: "webhook",
    id: webhookId,
    eventId: webhook.eventId,
  });
}

export async function emitWebhookEvent(
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  try {
    const activeWebhooks = await prisma.webhook.findMany({
      where: {
        eventId,
        active: true,
        events: { has: eventType },
      },
    });

    if (activeWebhooks.length === 0) return;

    const now = clock.now();
    await prisma.webhookDelivery.createMany({
      data: activeWebhooks.map((wh) => ({
        webhookId: wh.id,
        eventType,
        payload: payload as Prisma.InputJsonValue,
        status: "pending",
        attempts: 0,
        nextAttemptAt: now,
        createdAt: now,
      })),
    });
  } catch (err) {
    console.error("Failed to emit webhook event:", err);
  }
}

export async function deliverWebhook(deliveryId: string) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  });

  if (!delivery || !delivery.webhook) {
    return;
  }

  const webhook = delivery.webhook;
  const now = clock.now();

  // 1. Validate SSRF before fetching
  const ssrfCheck = await validateWebhookUrl(webhook.url);
  if (!ssrfCheck.allowed) {
    const attempts = delivery.attempts + 1;
    const isFailed = attempts >= 5;
    const nextAttemptAt = isFailed
      ? null
      : new Date(now.getTime() + (RETRY_BACKOFF_MS[attempts - 1] ?? 6 * 3600 * 1000));

    return prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        attempts,
        lastError: `SSRF blocked: ${ssrfCheck.reason}`,
        status: isFailed ? "failed" : "pending",
        nextAttemptAt,
      },
    });
  }

  // 2. Decrypt secret and sign payload
  const rawSecret = decryptPrivateKey(webhook.secret, config.SIGNING_KEY_SECRET);
  const timestamp = Math.floor(now.getTime() / 1000);
  const rawBody = JSON.stringify(delivery.payload);
  const signatureHex = crypto
    .createHmac("sha256", rawSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const signatureHeader = `t=${timestamp},v1=${signatureHex}`;

  // 3. Dispatch HTTP request with 5s timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Dogfood-Signature": signatureHeader,
        "X-Dogfood-Event": delivery.eventType,
        "X-Dogfood-Delivery": delivery.id,
      },
      body: rawBody,
      signal: controller.signal,
      redirect: "manual",
    });

    clearTimeout(timeout);
    const attempts = delivery.attempts + 1;
    const isSuccess = response.status >= 200 && response.status < 300;

    if (isSuccess) {
      return prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          attempts,
          status: "succeeded",
          deliveredAt: now,
          lastStatusCode: response.status,
          lastError: null,
          nextAttemptAt: null,
        },
      });
    } else {
      const isFailed = attempts >= 5;
      const nextAttemptAt = isFailed
        ? null
        : new Date(now.getTime() + (RETRY_BACKOFF_MS[attempts - 1] ?? 6 * 3600 * 1000));

      return prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          attempts,
          status: isFailed ? "failed" : "pending",
          lastStatusCode: response.status,
          lastError: `HTTP Status ${response.status}`,
          nextAttemptAt,
        },
      });
    }
  } catch (err: unknown) {
    clearTimeout(timeout);
    const attempts = delivery.attempts + 1;
    const isFailed = attempts >= 5;
    const nextAttemptAt = isFailed
      ? null
      : new Date(now.getTime() + (RETRY_BACKOFF_MS[attempts - 1] ?? 6 * 3600 * 1000));
    const errorMessage = err instanceof Error ? err.message : "Network request failed";

    return prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        attempts,
        status: isFailed ? "failed" : "pending",
        lastError: errorMessage,
        nextAttemptAt,
      },
    });
  }
}

export async function processPendingDeliveries(limit = 20) {
  const now = clock.now();
  const pending = await prisma.webhookDelivery.findMany({
    where: {
      status: "pending",
      nextAttemptAt: { lte: now },
    },
    take: limit,
  });

  for (const delivery of pending) {
    await deliverWebhook(delivery.id);
  }
  return pending.length;
}

export async function testWebhook(req: Request, webhookId: string) {
  const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook) throw notFound("Webhook not found");

  const now = clock.now();
  const delivery = await prisma.webhookDelivery.create({
    data: {
      webhookId,
      eventType: "ping",
      payload: {
        event: "ping",
        message: "Webhook ping test from DOGFOOD portal",
        webhookId,
        eventId: webhook.eventId,
        timestamp: now.toISOString(),
      },
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
    },
  });

  await audit(
    req,
    "webhook.test",
    { type: "webhook", id: webhookId, eventId: webhook.eventId },
    { deliveryId: delivery.id },
  );

  await deliverWebhook(delivery.id);
  const result = await prisma.webhookDelivery.findUnique({ where: { id: delivery.id } });

  return {
    delivery: {
      id: result!.id,
      webhookId: result!.webhookId,
      eventType: result!.eventType,
      payload: result!.payload,
      status: result!.status,
      attempts: result!.attempts,
      lastStatusCode: result!.lastStatusCode,
      lastError: result!.lastError,
      createdAt: result!.createdAt.toISOString(),
      deliveredAt: result!.deliveredAt?.toISOString() ?? null,
    },
  };
}

export async function listDeliveries(webhookId: string) {
  const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook) throw notFound("Webhook not found");

  const deliveries = await prisma.webhookDelivery.findMany({
    where: { webhookId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return {
    deliveries: deliveries.map((d) => ({
      id: d.id,
      webhookId: d.webhookId,
      eventType: d.eventType,
      payload: d.payload,
      status: d.status,
      attempts: d.attempts,
      lastStatusCode: d.lastStatusCode,
      lastError: d.lastError,
      createdAt: d.createdAt.toISOString(),
      deliveredAt: d.deliveredAt?.toISOString() ?? null,
    })),
  };
}

export async function redeliverWebhook(req: Request, deliveryId: string) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  });

  if (!delivery) throw notFound("Webhook delivery not found");

  const now = clock.now();
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: "pending",
      nextAttemptAt: now,
      attempts: 0,
      lastError: null,
      lastStatusCode: null,
    },
  });

  await audit(
    req,
    "webhook_delivery.redeliver",
    { type: "webhook_delivery", id: deliveryId, eventId: delivery.webhook.eventId },
    { webhookId: delivery.webhookId },
  );

  await deliverWebhook(deliveryId);
  const updated = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });

  return {
    delivery: {
      id: updated!.id,
      webhookId: updated!.webhookId,
      eventType: updated!.eventType,
      payload: updated!.payload,
      status: updated!.status,
      attempts: updated!.attempts,
      lastStatusCode: updated!.lastStatusCode,
      lastError: updated!.lastError,
      createdAt: updated!.createdAt.toISOString(),
      deliveredAt: updated!.deliveredAt?.toISOString() ?? null,
    },
  };
}
