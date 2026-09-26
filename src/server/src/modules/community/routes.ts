import { Router, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { castVoteBodySchema } from "@dogfood/shared";
import { HttpError } from "../../lib/http-error.js";
import { requireAuth } from "../../middleware/authorize.js";
import { validateBody } from "../../middleware/validate.js";
import { castVote, getBallot, retractVote } from "./voting.service.js";

export const communityRouter = Router();

const voteRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  keyGenerator: (req: Request) => {
    return req.user?.id ?? "unknown";
  },
  handler: (_req: Request, _res: Response, next: NextFunction) => {
    next(new HttpError(429, "rate_limit", "Too many voting requests, please try again later."));
  },
});

// Rate limit is applied individually after requireAuth

communityRouter.get(
  "/:eventId/ballot",
  requireAuth,
  voteRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { eventId } = req.params;
      const voterId = req.user!.id;
      const ballot = await getBallot(eventId as string, voterId);
      res.json(ballot);
    } catch (error) {
      next(error);
    }
  },
);

communityRouter.post(
  "/:eventId/votes",
  requireAuth,
  voteRateLimit,
  validateBody(castVoteBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { eventId } = req.params;
      const voterId = req.user!.id;
      const { projectId } = req.body;
      const result = await castVote(req, eventId as string, voterId, projectId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

communityRouter.delete(
  "/:eventId/votes/:trackId",
  requireAuth,
  voteRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { eventId, trackId } = req.params;
      const voterId = req.user!.id;

      await retractVote(req, eventId as string, voterId, trackId as string);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);
