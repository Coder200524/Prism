import { Router, type Request } from "express";
import {
  createWebhookSchema,
  updateWebhookSchema,
} from "@dogfood/shared";
import { assertApiKeyEventScope } from "../../lib/api-key-scope.js";
import { forbidden, notFound } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireEventRole } from "../../middleware/authorize.js";
import { validateBody } from "../../middleware/validate.js";
import * as webhooksService from "./webhooks.service.js";

export const webhooksRouter = Router();

// Helper to ensure user is ORGANIZER of the webhook's event or ADMIN
async function checkWebhookAccess(req: Request, webhookId: string) {
  const webhook = await prisma.webhook.findUnique({
    where: { id: webhookId },
    select: { eventId: true },
  });
  if (!webhook) {
    throw notFound("Webhook not found");
  }

  assertApiKeyEventScope(req, webhook.eventId);

  const user = req.user as { id: string; platformRole: string };
  if (user.platformRole !== "ADMIN") {
    const isOrganizer = await prisma.eventRole.findFirst({
      where: {
        userId: user.id,
        eventId: webhook.eventId,
        role: "ORGANIZER",
      },
    });
    if (!isOrganizer) {
      throw forbidden("forbidden", "Only event organizers or admins can manage webhooks");
    }
  }

  return webhook;
}

// 1. Webhook Detail
webhooksRouter.get("/webhooks/:id", requireAuth, async (req, res) => {
  await checkWebhookAccess(req, req.params.id as string);
  const result = await webhooksService.getWebhook(req.params.id as string);
  res.status(200).json(result);
});

// 2. Webhook Update
webhooksRouter.patch(
  "/webhooks/:id",
  requireAuth,
  validateBody(updateWebhookSchema),
  async (req, res) => {
    await checkWebhookAccess(req, req.params.id as string);
    const result = await webhooksService.updateWebhook(req, req.params.id as string, req.body);
    res.status(200).json(result);
  },
);

// 3. Webhook Delete
webhooksRouter.delete("/webhooks/:id", requireAuth, async (req, res) => {
  await checkWebhookAccess(req, req.params.id as string);
  await webhooksService.deleteWebhook(req, req.params.id as string);
  res.status(204).send();
});

// 4. Test Webhook (Send Ping)
webhooksRouter.post("/webhooks/:id/test", requireAuth, async (req, res) => {
  await checkWebhookAccess(req, req.params.id as string);
  const result = await webhooksService.testWebhook(req, req.params.id as string);
  res.status(200).json(result);
});

// 5. List Webhook Deliveries
webhooksRouter.get("/webhooks/:id/deliveries", requireAuth, async (req, res) => {
  await checkWebhookAccess(req, req.params.id as string);
  const result = await webhooksService.listDeliveries(req.params.id as string);
  res.status(200).json(result);
});

// 6. Redeliver Delivery
webhooksRouter.post("/webhook-deliveries/:id/redeliver", requireAuth, async (req, res) => {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: req.params.id as string },
    select: { webhookId: true },
  });
  if (!delivery) throw notFound("Webhook delivery not found");

  await checkWebhookAccess(req, delivery.webhookId);
  const result = await webhooksService.redeliverWebhook(req, req.params.id as string);
  res.status(200).json(result);
});

// Mount event-scoped webhook CRUD on events router
export function mountWebhooksOnEvents(eventsRouter: Router): void {
  eventsRouter.get(
    "/:eventId/webhooks",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    async (req, res) => {
      const result = await webhooksService.listWebhooks(req.params.eventId as string);
      res.status(200).json(result);
    },
  );

  eventsRouter.post(
    "/:eventId/webhooks",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    validateBody(createWebhookSchema),
    async (req, res) => {
      const result = await webhooksService.createWebhook(
        req,
        req.params.eventId as string,
        req.body,
      );
      res.status(201).json(result);
    },
  );
}
