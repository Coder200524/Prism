import express, { Router } from "express";
import { requireAuth, requireEventRole, requirePlatformRole } from "../../middleware/authorize.js";
import { payloadTooLarge } from "../../lib/http-error.js";
import * as exportService from "./export.service.js";
import * as importService from "./import.service.js";

export const eventTransferRouter = Router({ mergeParams: true });
export const transferRouter = Router();

const json10mb = express.json({ limit: "10mb" });
const text10mb = express.text({ limit: "10mb", type: ["text/csv", "text/plain", "application/octet-stream"] });

// Export endpoints
eventTransferRouter.get(
  "/export.json",
  requireAuth,
  requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
  async (req, res) => {
    const result = await exportService.exportEventJson(req, req.params.eventId as string);
    res.setHeader("Content-Type", "application/json");
    res.status(200).json(result);
  },
);

eventTransferRouter.get(
  "/export/projects.csv",
  requireAuth,
  requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
  async (req, res) => {
    const csv = await exportService.exportProjectsCsv(req, req.params.eventId as string);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="projects_${req.params.eventId}.csv"`);
    res.status(200).send(csv);
  },
);

eventTransferRouter.get(
  "/export/judges.csv",
  requireAuth,
  requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
  async (req, res) => {
    const csv = await exportService.exportJudgesCsv(req, req.params.eventId as string);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="judges_${req.params.eventId}.csv"`);
    res.status(200).send(csv);
  },
);

// Import JSON endpoint (10MB limit)
transferRouter.post(
  "/import",
  requireAuth,
  requirePlatformRole("ORGANIZER", "ADMIN"),
  (req, res, next) => {
    json10mb(req, res, (err) => {
      if (err) {
        next(payloadTooLarge("Payload exceeds 10 MB limit"));
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const dryRun = req.query.dryRun === "true";
    const result = await importService.importData(req, req.body, dryRun);
    res.status(200).json(result);
  },
);

// Import Judges CSV endpoint (10MB limit)
eventTransferRouter.post(
  "/import/judges.csv",
  requireAuth,
  requireEventRole("ORGANIZER", (req) => req.params.eventId as string),
  (req, res, next) => {
    text10mb(req, res, (err) => {
      if (err) {
        next(payloadTooLarge("Payload exceeds 10 MB limit"));
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const dryRun = req.query.dryRun === "true";
    const csvContent = typeof req.body === "string" ? req.body : "";
    const result = await importService.importJudgesCsv(
      req,
      req.params.eventId as string,
      csvContent,
      dryRun,
    );
    res.status(200).json(result);
  },
);
