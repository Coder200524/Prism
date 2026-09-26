import { Router } from "express";
import {
  exportQuerySchema,
  judgeInviteBodySchema,
  judgeScoresQuerySchema,
  judgeTracksBodySchema,
  manualAssignmentBodySchema,
  putCriteriaBodySchema,
  scoreUpdateBodySchema,
  auditQuerySchema,
} from "@dogfood/shared";
import {
  requireAuth,
  requireAnyEventRole,
  requireEventRole,
} from "../../middleware/authorize.js";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { notFound } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import * as judging from "./service.js";

export const judgeRouter = Router();
export const judgeInvitesRouter = Router();

export function mountJudgingOnEvents(eventsRouter: Router): void {
  eventsRouter.get(
    "/:eventId/criteria",
    requireAuth,
    requireAnyEventRole(["ORGANIZER", "JUDGE"], (req) => req.params.eventId as string),
    async (req, res) => {
      const result = await judging.getCriteria(req.params.eventId as string);
      res.status(200).json(result);
    },
  );

  eventsRouter.put(
    "/:eventId/criteria",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    validateBody(putCriteriaBodySchema),
    async (req, res) => {
      const result = await judging.putCriteria(req, req.params.eventId as string, req.body);
      res.status(200).json(result);
    },
  );

  eventsRouter.get(
    "/:eventId/judges",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    async (req, res) => {
      const result = await judging.listJudges(req.params.eventId as string);
      res.status(200).json(result);
    },
  );

  eventsRouter.post(
    "/:eventId/judges/invites",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    validateBody(judgeInviteBodySchema),
    async (req, res) => {
      const result = await judging.createJudgeInvite(req, req.params.eventId as string, req.body);
      res.status(201).json(result);
    },
  );

  eventsRouter.put(
    "/:eventId/judges/:userId/tracks",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    validateBody(judgeTracksBodySchema),
    async (req, res) => {
      const result = await judging.setJudgeTracks(
        req,
        req.params.eventId as string,
        req.params.userId as string,
        req.body,
      );
      res.status(200).json(result);
    },
  );

  eventsRouter.delete(
    "/:eventId/judges/:userId",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    async (req, res) => {
      await judging.removeJudge(req, req.params.eventId as string, req.params.userId as string);
      res.status(204).send();
    },
  );

  eventsRouter.get(
    "/:eventId/assignments",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    async (req, res) => {
      const result = await judging.listAssignments(req.params.eventId as string);
      res.status(200).json(result);
    },
  );

  eventsRouter.post(
    "/:eventId/assignments/auto",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    async (req, res) => {
      const result = await judging.autoAssign(req, req.params.eventId as string);
      res.status(200).json(result);
    },
  );

  eventsRouter.post(
    "/:eventId/assignments",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    validateBody(manualAssignmentBodySchema),
    async (req, res) => {
      const result = await judging.manualAssign(req, req.params.eventId as string, req.body);
      res.status(201).json(result);
    },
  );

  eventsRouter.get(
    "/:eventId/results",
    async (req, res) => {
      const result = await judging.getResults(req, req.params.eventId as string);
      res.status(200).json(result);
    },
  );

  eventsRouter.post(
    "/:eventId/results/publish",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    async (req, res) => {
      const result = await judging.publishResults(req, req.params.eventId as string);
      res.status(200).json(result);
    },
  );

  eventsRouter.post(
    "/:eventId/results/unpublish",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    async (req, res) => {
      const result = await judging.unpublishResults(req, req.params.eventId as string);
      res.status(200).json(result);
    },
  );

  eventsRouter.get(
    "/:eventId/dashboard",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    async (req, res) => {
      const result = await judging.getDashboard(req.params.eventId as string);
      res.status(200).json(result);
    },
  );

  eventsRouter.get(
    "/:eventId/export.csv",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    validateQuery(exportQuerySchema),
    async (req, res) => {
      const type = (req.query as { type: "results" | "scores" }).type;
      const csv = await judging.exportCsv(req, req.params.eventId as string, type);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${req.params.eventId}-${type}.csv"`,
      );
      res.status(200).send(csv);
    },
  );

  eventsRouter.get(
    "/:eventId/audit",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    validateQuery(auditQuerySchema),
    async (req, res) => {
      const query = req.query as unknown as { page: number; pageSize: number };
      const result = await judging.listAudit(
        req.params.eventId as string,
        query.page,
        query.pageSize,
      );
      res.status(200).json(result);
    },
  );
}

export const assignmentsRouter = Router();

assignmentsRouter.delete("/:assignmentId", requireAuth, async (req, _res, next) => {
  const assignment = await prisma.assignment.findUnique({
    where: { id: req.params.assignmentId as string },
    select: { eventId: true },
  });
  if (!assignment) {
    next(notFound("Assignment not found"));
    return;
  }
  req.params.eventId = assignment.eventId;
  next();
}, requireEventRole("ORGANIZER", (req) => req.params.eventId as string), async (req, res) => {
  await judging.deleteAssignment(req, req.params.assignmentId as string);
  res.status(204).send();
});

judgeInvitesRouter.get("/:token", async (req, res) => {
  const result = await judging.previewJudgeInvite(req.params.token as string);
  res.status(200).json(result);
});

judgeInvitesRouter.post("/:token/accept", requireAuth, async (req, res) => {
  const result = await judging.acceptJudgeInvite(req, req.params.token as string);
  res.status(200).json(result);
});

judgeRouter.get("/assignments", requireAuth, async (req, res) => {
  const eventId =
    typeof req.query.eventId === "string" ? req.query.eventId : undefined;
  const result = await judging.listJudgeAssignments(req, eventId);
  res.status(200).json(result);
});

judgeRouter.get("/assignments/:assignmentId", requireAuth, async (req, res) => {
  const result = await judging.getJudgeAssignment(req, req.params.assignmentId as string);
  res.status(200).json(result);
});

judgeRouter.put(
  "/assignments/:assignmentId/scores",
  requireAuth,
  validateBody(scoreUpdateBodySchema),
  async (req, res) => {
    const result = await judging.updateScores(
      req,
      req.params.assignmentId as string,
      req.body,
    );
    res.status(200).json(result);
  },
);

judgeRouter.get("/scores", requireAuth, validateQuery(judgeScoresQuerySchema), async (req, res) => {
  const query = req.query as unknown as { judge?: string; eventId?: string };
  const result = await judging.getJudgeScores(req, query);
  res.status(200).json(result);
});
