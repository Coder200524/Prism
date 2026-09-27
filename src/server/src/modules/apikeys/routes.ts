import { Router } from "express";
import { createApiKeyBodySchema } from "@dogfood/shared";
import { requireAuth, requireEventRole } from "../../middleware/authorize.js";
import { validateBody } from "../../middleware/validate.js";
import * as apiKeyService from "./service.js";

export const eventApiKeysRouter = Router({ mergeParams: true });
export const apiKeysRouter = Router();

eventApiKeysRouter.post(
  "/",
  requireAuth,
  requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
  validateBody(createApiKeyBodySchema),
  async (req, res) => {
    const result = await apiKeyService.createApiKey(req, req.params.eventId as string, req.body);
    res.status(201).json(result);
  },
);

eventApiKeysRouter.get(
  "/",
  requireAuth,
  requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
  async (req, res) => {
    const result = await apiKeyService.listApiKeys(req, req.params.eventId as string);
    res.status(200).json(result);
  },
);

apiKeysRouter.delete("/:id", requireAuth, async (req, res) => {
  const result = await apiKeyService.revokeApiKey(req, req.params.id as string);
  res.status(200).json(result);
});
