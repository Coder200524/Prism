import { Router } from "express";
import {
  revokeRecordSchema,
  verifyRecordSchema,
} from "@dogfood/shared";
import { forbidden, notFound } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireEventRole } from "../../middleware/authorize.js";
import { validateBody } from "../../middleware/validate.js";
import * as recordsService from "./records.service.js";

export const recordsRouter = Router();

// Public routes (no auth required)
recordsRouter.get("/keys", async (_req, res) => {
  const result = await recordsService.getPublicSigningKeys();
  res.status(200).json(result);
});

recordsRouter.post(
  "/verify",
  validateBody(verifyRecordSchema),
  async (req, res) => {
    const result = await recordsService.verifyRecordPayload(req.body);
    res.status(200).json(result);
  },
);

recordsRouter.get("/:id", async (req, res) => {
  const result = await recordsService.getRecordPublic(req.params.id as string);
  res.status(200).json(result);
});

// Authenticated routes
recordsRouter.get("/me/records", requireAuth, async (req, res) => {
  const result = await recordsService.getUserRecords((req.user as { id: string }).id);
  res.status(200).json({ records: result });
});

recordsRouter.get("/me/certificates", requireAuth, async (req, res) => {
  const certificates = await recordsService.getUserCertificates((req.user as { id: string }).id);
  res.status(200).json({ certificates });
});

recordsRouter.post(
  "/:id/revoke",
  requireAuth,
  validateBody(revokeRecordSchema),
  async (req, res) => {
    const record = await prisma.record.findUnique({
      where: { id: req.params.id as string },
      select: { eventId: true },
    });
    if (!record) {
      throw notFound("Record not found");
    }

    const user = req.user as { id: string; platformRole: string };
    if (user.platformRole !== "ADMIN") {
      const isOrganizer = await prisma.eventRole.findFirst({
        where: {
          userId: user.id,
          eventId: record.eventId,
          role: "ORGANIZER",
        },
      });
      if (!isOrganizer) {
        throw forbidden("forbidden", "Only event organizers or admins can revoke records");
      }
    }

    const updated = await recordsService.revokeRecord(
      req,
      req.params.id as string,
      req.body.reason,
    );
    res.status(200).json(updated);
  },
);

export function mountRecordsOnEvents(eventsRouter: Router): void {
  eventsRouter.post(
    "/:eventId/records/issue",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    async (req, res) => {
      const records = await recordsService.issueJudgeParticipationRecords(
        req.params.eventId as string,
        req,
      );
      res.status(200).json({ issuedCount: records.length, records });
    },
  );

  eventsRouter.get(
    "/:eventId/certificates",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    async (req, res) => {
      const certificates = await recordsService.getEventCertificates(
        req.params.eventId as string,
      );
      res.status(200).json({ certificates });
    },
  );

  eventsRouter.post(
    "/:eventId/certificates/issue",
    requireAuth,
    requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
    async (req, res) => {
      const records = await recordsService.issueCertificates(
        req.params.eventId as string,
        req,
      );
      res.status(200).json({ issuedCount: records.length, records });
    },
  );
}
