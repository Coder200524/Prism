import { Router } from "express";
import {
  createEventBodySchema,
  createPrizeBodySchema,
  createTrackBodySchema,
  createTeamBodySchema,
  patchEventBodySchema,
  patchPrizeBodySchema,
  patchTrackBodySchema,
} from "@dogfood/shared";
import { requireAuth, requireEventRole, requirePlatformRole } from "../../middleware/authorize.js";
import { validateBody } from "../../middleware/validate.js";
import * as teamsService from "../teams/service.js";
import { mountJudgingOnEvents } from "../judging/routes.js";
import { eventApiKeysRouter } from "../apikeys/routes.js";
import { eventTransferRouter } from "../transfer/routes.js";
import * as eventsService from "./service.js";

export const eventsRouter = Router();

eventsRouter.use("/:eventId/api-keys", eventApiKeysRouter);
eventsRouter.use("/:eventId", eventTransferRouter);



eventsRouter.get("/", async (req, res) => {
  const result = await eventsService.listEvents(req);
  res.status(200).json(result);
});

eventsRouter.post(
  "/",
  requireAuth,
  requirePlatformRole("ORGANIZER", "ADMIN"),
  validateBody(createEventBodySchema),
  async (req, res) => {
    const result = await eventsService.createEvent(req, req.body);
    res.status(201).json(result);
  },
);

eventsRouter.get("/:eventId", async (req, res) => {
  const result = await eventsService.getEvent(req, req.params.eventId as string);
  res.status(200).json(result);
});

eventsRouter.patch(
  "/:eventId",
  requireAuth,
  requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
  validateBody(patchEventBodySchema),
  async (req, res) => {
    const result = await eventsService.updateEvent(req, req.params.eventId as string, req.body);
    res.status(200).json(result);
  },
);

eventsRouter.post(
  "/:eventId/publish",
  requireAuth,
  requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
  async (req, res) => {
    const result = await eventsService.publishEvent(req, req.params.eventId as string);
    res.status(200).json(result);
  },
);

eventsRouter.post(
  "/:eventId/teams",
  requireAuth,
  validateBody(createTeamBodySchema),
  async (req, res) => {
    const result = await teamsService.createTeam(req, req.params.eventId as string, req.body);
    res.status(201).json(result);
  },
);

eventsRouter.post(
  "/:eventId/tracks",
  requireAuth,
  requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
  validateBody(createTrackBodySchema),
  async (req, res) => {
    const result = await eventsService.createTrack(req, req.params.eventId as string, req.body);
    res.status(201).json(result);
  },
);

eventsRouter.patch(
  "/:eventId/tracks/:trackId",
  requireAuth,
  requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
  validateBody(patchTrackBodySchema),
  async (req, res) => {
    const result = await eventsService.updateTrack(
      req,
      req.params.eventId as string,
      req.params.trackId as string,
      req.body,
    );
    res.status(200).json(result);
  },
);

eventsRouter.delete(
  "/:eventId/tracks/:trackId",
  requireAuth,
  requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
  async (req, res) => {
    await eventsService.deleteTrack(
      req,
      req.params.eventId as string,
      req.params.trackId as string,
    );
    res.status(204).send();
  },
);

eventsRouter.post(
  "/:eventId/prizes",
  requireAuth,
  requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
  validateBody(createPrizeBodySchema),
  async (req, res) => {
    const result = await eventsService.createPrize(req, req.params.eventId as string, req.body);
    res.status(201).json(result);
  },
);

eventsRouter.patch(
  "/:eventId/prizes/:prizeId",
  requireAuth,
  requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
  validateBody(patchPrizeBodySchema),
  async (req, res) => {
    const result = await eventsService.updatePrize(
      req,
      req.params.eventId as string,
      req.params.prizeId as string,
      req.body,
    );
    res.status(200).json(result);
  },
);

eventsRouter.delete(
  "/:eventId/prizes/:prizeId",
  requireAuth,
  requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
  async (req, res) => {
    await eventsService.deletePrize(
      req,
      req.params.eventId as string,
      req.params.prizeId as string,
    );
    res.status(204).send();
  },
);

mountJudgingOnEvents(eventsRouter);
