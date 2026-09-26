import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/http-error.js";

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new HttpError(404, "not_found", "Not found"));
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "validation_error",
        message: "Invalid request",
        details: err.flatten(),
      },
    });
    return;
  }

  if (err && typeof err === "object" && "type" in err) {
    if (err.type === "entity.parse.failed") {
      res.status(400).json({
        error: { code: "bad_request", message: "Malformed JSON" },
      });
      return;
    }
    if (err.type === "entity.too.large") {
      res.status(413).json({
        error: { code: "payload_too_large", message: "Payload too large" },
      });
      return;
    }
  }

  console.error(err);
  res.status(500).json({
    error: {
      code: "internal_error",
      message: "Internal server error",
    },
  });
};
