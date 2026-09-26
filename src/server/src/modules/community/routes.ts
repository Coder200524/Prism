import { Router, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { castVoteBodySchema } from "@dogfood/shared";
import { HttpError } from "../../lib/http-error.js";
import { requireAuth, requireEventRole } from "../../middleware/authorize.js";
import { validateBody } from "../../middleware/validate.js";
import { castVote, getBallot, retractVote, getCommunityResults, getCommunityTurnout, getFlaggedVotes, voidVote, restoreVote } from "./voting.service.js";
import { EventRoleType } from "@prisma/client";
import { voidVoteBodySchema } from "@dogfood/shared";

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
  "/events/:eventId/ballot",
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
  "/events/:eventId/votes",
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
  "/events/:eventId/votes/:trackId",
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

const commentMinRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req: Request) => req.user?.id ?? "unknown",
  handler: (_req: Request, _res: Response, next: NextFunction) => {
    next(new HttpError(429, "rate_limit", "Too many comments, please try again later."));
  },
});

const commentDayRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 50,
  keyGenerator: (req: Request) => req.user?.id ?? "unknown",
  handler: (_req: Request, _res: Response, next: NextFunction) => {
    next(new HttpError(429, "rate_limit", "Daily comment limit reached."));
  },
});

import { createCommentBodySchema, hideCommentBodySchema } from "@dogfood/shared";
import {
  getProjectComments,
  postComment,
  deleteComment,
  hideComment,
  unhideComment,
  getEventComments,
} from "./comments.service.js";

// GET /api/projects/:projectId/comments (public)
communityRouter.get(
  "/projects/:projectId/comments",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.params;
      const comments = await getProjectComments(projectId as string);
      res.json(comments);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/projects/:projectId/comments (auth)
communityRouter.post(
  "/projects/:projectId/comments",
  requireAuth,
  commentMinRateLimit,
  commentDayRateLimit,
  validateBody(createCommentBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.params;
      const authorId = req.user!.id;
      const { body } = req.body;
      const result = await postComment(req, projectId as string, authorId, body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /api/comments/:commentId
communityRouter.delete(
  "/comments/:commentId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { commentId } = req.params;
      const userId = req.user!.id;
      await deleteComment(req, commentId as string, userId);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/comments/:commentId/hide
communityRouter.post(
  "/comments/:commentId/hide",
  requireAuth,
  validateBody(hideCommentBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { commentId } = req.params;
      const userId = req.user!.id;
      const { reason } = req.body;
      await hideComment(req, commentId as string, userId, reason);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/comments/:commentId/unhide
communityRouter.post(
  "/comments/:commentId/unhide",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { commentId } = req.params;
      const userId = req.user!.id;
      await unhideComment(req, commentId as string, userId);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/events/:eventId/comments (organizer)
communityRouter.get(
  "/events/:eventId/comments",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { eventId } = req.params;
      const userId = req.user!.id;
      const comments = await getEventComments(eventId as string, userId);
      res.json(comments);
    } catch (error) {
      next(error);
    }
  },
);



// GET /api/events/:eventId/community-results
communityRouter.get(
  "/events/:eventId/community-results",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const results = await getCommunityResults(req.params.eventId as string);
      res.json(results);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/events/:eventId/community-turnout
communityRouter.get(
  "/events/:eventId/community-turnout",
  requireAuth,
  requireEventRole(EventRoleType.ORGANIZER, (req) => req.params.eventId as string),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const turnout = await getCommunityTurnout(req.params.eventId as string);
      res.json(turnout);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/events/:eventId/votes/flagged
communityRouter.get(
  "/events/:eventId/votes/flagged",
  requireAuth,
  requireEventRole(EventRoleType.ORGANIZER, (req) => req.params.eventId as string),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const flagged = await getFlaggedVotes(req.params.eventId as string);
      res.json(flagged);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/votes/:voteId/void
communityRouter.post(
  "/votes/:voteId/void",
  requireAuth,
  validateBody(voidVoteBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await voidVote(req, req.params.voteId as string, req.body.reason, req.user!.id);
      res.sendStatus(200);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/votes/:voteId/restore
communityRouter.post(
  "/votes/:voteId/restore",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await restoreVote(req, req.params.voteId as string, req.user!.id);
      res.sendStatus(200);
    } catch (err) {
      next(err);
    }
  }
);


