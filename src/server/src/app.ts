import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type Request, type Response } from "express";
import { prisma } from "./lib/prisma.js";
import { authenticate, apiKeyRateLimiter } from "./middleware/authenticate.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { adminRouter } from "./modules/admin/routes.js";
import { authRouter } from "./modules/auth/routes.js";
import { eventsRouter } from "./modules/events/routes.js";
import {
  assignmentsRouter,
  judgeInvitesRouter,
  judgeRouter,
} from "./modules/judging/routes.js";
import { projectsRouter } from "./modules/projects/routes.js";
import { teamsRouter } from "./modules/teams/routes.js";
import { communityRouter } from "./modules/community/routes.js";
import { apiKeysRouter } from "./modules/apikeys/routes.js";
import { openapiRouter } from "./modules/openapi/routes.js";
import { transferRouter } from "./modules/transfer/routes.js";
import { embedApiRouter, embedScriptRouter } from "./modules/embed/routes.js";
import { webhooksRouter } from "./modules/webhooks/routes.js";
import { recordsRouter, meRecordsRouter } from "./modules/records/routes.js";
import "./types/express.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(): Express {
  const app = express();

  if (process.env.TRUST_PROXY === "1") {
    app.set("trust proxy", 1);
  }
  
  app.use((req: Request, res: Response, next: express.NextFunction) => {
    const isEmbedRoute = req.path.startsWith("/embed") || req.path === "/embed.js" || req.path.startsWith("/api/embed");
    const allowedOrigins = process.env.EMBED_ALLOWED_ORIGINS || "*";
    
    if (isEmbedRoute) {
      res.setHeader(
        "Content-Security-Policy",
        `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors ${allowedOrigins}`
      );
    } else {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
      );
      res.setHeader("X-Frame-Options", "DENY");
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.removeHeader("X-Powered-By");
    next();
  });

  app.use(express.json({ limit: "1mb" }));
  app.use(authenticate);
  app.use(apiKeyRateLimiter);

  app.get("/api/health", async (_req: Request, res: Response) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  });

  app.use("/api", openapiRouter);
  app.use("/api", transferRouter);
  // JSON embed API only under /api/embed/* so /embed/gallery stays the SPA HTML page.
  app.use("/api/embed", embedApiRouter);
  app.use("/", embedScriptRouter);
  app.use("/api", webhooksRouter);
  // Only mount under /api/records — a catch-all GET /:id on /api would
  // intercept /api/events, /api/projects, and other single-segment routes.
  app.use("/api/records", recordsRouter);
  app.use("/api/me", meRecordsRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/api-keys", apiKeysRouter);
  app.use("/api", communityRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/teams", teamsRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/judge", judgeRouter);
  app.use("/api/judge-invites", judgeInvitesRouter);
  app.use("/api/assignments", assignmentsRouter);

  app.use("/api", notFoundHandler);

  const webDist = path.resolve(__dirname, "../../web/dist");
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(webDist, "index.html"));
  });

  app.use(errorHandler);

  return app;
}
