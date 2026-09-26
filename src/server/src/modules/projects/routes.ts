import { Router } from "express";
import { galleryQuerySchema } from "@dogfood/shared";
import { requireAuth, requireEventRole } from "../../middleware/authorize.js";
import { validateQuery } from "../../middleware/validate.js";
import { notFound } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import * as projectsService from "./service.js";

export const projectsRouter = Router();

projectsRouter.get("/", validateQuery(galleryQuerySchema), async (req, res) => {
  const result = await projectsService.listGallery(req.query as never);
  res.status(200).json(result);
});

projectsRouter.get("/:projectId", async (req, res) => {
  const result = await projectsService.getProject(req, req.params.projectId as string);
  res.status(200).json(result);
});

projectsRouter.post("/", requireAuth, async (req, res) => {
  const result = await projectsService.createProject(req);
  res.status(201).json(result);
});

projectsRouter.patch("/:projectId", requireAuth, async (req, res) => {
  const result = await projectsService.updateProject(req, req.params.projectId as string);
  res.status(200).json(result);
});

projectsRouter.post("/:projectId/submit", requireAuth, async (req, res) => {
  const result = await projectsService.submitProject(req, req.params.projectId as string);
  res.status(200).json(result);
});

projectsRouter.post(
  "/:projectId/clear-duplicate",
  requireAuth,
  async (req, _res, next) => {
    const project = await prisma.project.findUnique({
      where: { id: req.params.projectId as string },
      select: { eventId: true },
    });
    if (!project) {
      next(notFound("Project not found"));
      return;
    }
    req.params.eventId = project.eventId;
    next();
  },
  requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
  async (req, res) => {
    const result = await projectsService.clearDuplicate(req, req.params.projectId as string);
    res.status(200).json(result);
  },
);
