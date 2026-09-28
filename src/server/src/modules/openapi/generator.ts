import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  type ResponseConfig,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  castVoteBodySchema,
  createApiKeyBodySchema,
  createCommentBodySchema,
  createEventBodySchema,
  createPrizeBodySchema,
  createProjectBodySchema,
  createTeamBodySchema,
  createTrackBodySchema,
  createWebhookSchema,
  hideCommentBodySchema,
  judgeInviteBodySchema,
  judgeTracksBodySchema,
  loginBodySchema,
  manualAssignmentBodySchema,
  patchEventBodySchema,
  patchPrizeBodySchema,
  patchProjectBodySchema,
  patchTrackBodySchema,
  patchUserBodySchema,
  putCriteriaBodySchema,
  registerBodySchema,
  revokeRecordSchema,
  scoreUpdateBodySchema,
  updateWebhookSchema,
  verifyRecordSchema,
  voidVoteBodySchema,
} from "@dogfood/shared";

export function generateOpenApiSpec() {
  const registry = new OpenAPIRegistry();

  registry.registerComponent("securitySchemes", "BearerAuth", {
    type: "http",
    scheme: "bearer",
    description: "Session token or API key passed as Bearer token",
  });

  const errorResponseSchema = z.object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  });

  const commonResponses = {
    400: {
      description: "Bad request / validation error",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    401: {
      description: "Unauthorized - missing or invalid token",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Forbidden - insufficient permissions or closed phase",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Conflict",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    429: {
      description: "Too many requests / rate limited",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  };

  // Helper to add standard route
  const addRoute = (
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
    summary: string,
    opts?: {
      security?: boolean;
      body?: z.ZodType;
      query?: z.ZodType;
      responses?: Record<number, { description: string; content?: Record<string, { schema: z.ZodType }> }>;
      contentType?: string;
    },
  ) => {
    const responses: Record<number | string, unknown> = {
      200: opts?.responses?.[200] ?? { description: "Successful response" },
      ...commonResponses,
      ...opts?.responses,
    };

    registry.registerPath({
      method,
      path,
      summary,
      security: opts?.security ? [{ BearerAuth: [] }] : [],
      request: {
        ...(opts?.body
          ? {
              body: {
                content: { [opts?.contentType ?? "application/json"]: { schema: opts.body } },
              },
            }
          : {}),
      },
      responses: responses as Record<string, ResponseConfig>,
    });
  };

  // ─── Health ───
  // app.get("/api/health")
  addRoute("get", "/api/health", "Health check");

  // ─── Auth (mounted at /api/auth) ───
  addRoute("post", "/api/auth/register", "Register a new user", { body: registerBodySchema });
  addRoute("post", "/api/auth/login", "Log in user", { body: loginBodySchema });
  addRoute("post", "/api/auth/logout", "Log out user", { security: true });
  addRoute("get", "/api/auth/me", "Get current user profile", { security: true });

  // ─── Admin (mounted at /api/admin) ───
  addRoute("get", "/api/admin/users", "List all users", { security: true });
  addRoute("patch", "/api/admin/users/{userId}", "Update user role", { security: true, body: patchUserBodySchema });
  addRoute("post", "/api/admin/records/keys/rotate", "Rotate signing key pair", { security: true });

  // ─── Events (mounted at /api/events) ───
  addRoute("get", "/api/events", "List public events");
  addRoute("post", "/api/events", "Create an event", { security: true, body: createEventBodySchema });
  addRoute("get", "/api/events/{eventId}", "Get event details");
  addRoute("patch", "/api/events/{eventId}", "Update an event", { security: true, body: patchEventBodySchema });
  addRoute("post", "/api/events/{eventId}/publish", "Publish event", { security: true });
  addRoute("post", "/api/events/{eventId}/teams", "Create a team", { security: true, body: createTeamBodySchema });
  addRoute("post", "/api/events/{eventId}/tracks", "Add track", { security: true, body: createTrackBodySchema });
  addRoute("patch", "/api/events/{eventId}/tracks/{trackId}", "Update track", { security: true, body: patchTrackBodySchema });
  addRoute("delete", "/api/events/{eventId}/tracks/{trackId}", "Delete track", { security: true });
  addRoute("post", "/api/events/{eventId}/prizes", "Add prize", { security: true, body: createPrizeBodySchema });
  addRoute("patch", "/api/events/{eventId}/prizes/{prizeId}", "Update prize", { security: true, body: patchPrizeBodySchema });
  addRoute("delete", "/api/events/{eventId}/prizes/{prizeId}", "Delete prize", { security: true });

  // ─── API Keys (event-scoped on /api/events/:eventId/api-keys, standalone on /api/api-keys) ───
  addRoute("get", "/api/events/{eventId}/api-keys", "List API keys for event", { security: true });
  addRoute("post", "/api/events/{eventId}/api-keys", "Create API key for event", { security: true, body: createApiKeyBodySchema });
  addRoute("delete", "/api/api-keys/{id}", "Revoke API key", { security: true });

  // ─── Judging (mounted on events via mountJudgingOnEvents) ───
  addRoute("get", "/api/events/{eventId}/criteria", "Get rubric criteria", { security: true });
  addRoute("put", "/api/events/{eventId}/criteria", "Update rubric criteria", { security: true, body: putCriteriaBodySchema });
  addRoute("get", "/api/events/{eventId}/judges", "List judges for event", { security: true });
  addRoute("post", "/api/events/{eventId}/judges/invites", "Create judge invite", { security: true, body: judgeInviteBodySchema });
  addRoute("put", "/api/events/{eventId}/judges/{userId}/tracks", "Update judge track assignments", { security: true, body: judgeTracksBodySchema });
  addRoute("delete", "/api/events/{eventId}/judges/{userId}", "Remove judge from event", { security: true });
  addRoute("get", "/api/events/{eventId}/assignments", "List event assignments", { security: true });
  addRoute("post", "/api/events/{eventId}/assignments/auto", "Auto generate assignments", { security: true });
  addRoute("post", "/api/events/{eventId}/assignments", "Create manual assignment", { security: true, body: manualAssignmentBodySchema });
  addRoute("get", "/api/events/{eventId}/results", "Get published or organizer results");
  addRoute("post", "/api/events/{eventId}/results/publish", "Publish event results", { security: true });
  addRoute("post", "/api/events/{eventId}/results/unpublish", "Unpublish event results", { security: true });
  addRoute("get", "/api/events/{eventId}/dashboard", "Organizer live dashboard", { security: true });
  addRoute("get", "/api/events/{eventId}/export.csv", "Export scores CSV", {
    security: true,
    responses: {
      200: { description: "CSV file download", content: { "text/csv": { schema: z.string() } } },
    },
  });
  addRoute("get", "/api/events/{eventId}/audit", "Get event audit log", { security: true });

  // ─── Transfer / Import-Export (eventTransferRouter on /api/events/:eventId, transferRouter on /api) ───
  addRoute("get", "/api/events/{eventId}/export.json", "Export full event JSON", { security: true });
  addRoute("get", "/api/events/{eventId}/export/projects.csv", "Export projects CSV", {
    security: true,
    responses: {
      200: { description: "CSV file download", content: { "text/csv": { schema: z.string() } } },
    },
  });
  addRoute("get", "/api/events/{eventId}/export/judges.csv", "Export judges CSV", {
    security: true,
    responses: {
      200: { description: "CSV file download", content: { "text/csv": { schema: z.string() } } },
    },
  });
  addRoute("post", "/api/import", "Import event JSON or fixtures document", { security: true });
  addRoute("post", "/api/events/{eventId}/import/judges.csv", "Import judges from CSV", {
    security: true,
    contentType: "text/csv",
  });
  addRoute("post", "/api/events/{eventId}/import.json", "Import JSON into existing event", { security: true });

  // ─── Records (mounted at /api/records and /api/me, plus events via mountRecordsOnEvents) ───
  addRoute("get", "/api/records/keys", "Get public signing keys for records verification");
  addRoute("post", "/api/records/verify", "Verify a record signature and status", { body: verifyRecordSchema });
  addRoute("get", "/api/records/{id}", "Get record details and verification status");
  addRoute("post", "/api/records/{id}/revoke", "Revoke record", { security: true, body: revokeRecordSchema });
  addRoute("get", "/api/me/records", "List records for logged-in user", { security: true });
  addRoute("get", "/api/me/certificates", "List certificates for logged-in user", { security: true });
  addRoute("post", "/api/events/{eventId}/records/issue", "Issue judge participation records for event", { security: true });
  addRoute("get", "/api/events/{eventId}/certificates", "List certificates for event", { security: true });
  addRoute("post", "/api/events/{eventId}/certificates/issue", "Issue certificates for event", { security: true });

  // ─── Teams (mounted at /api/teams) ───
  addRoute("get", "/api/teams/invite/{code}", "Get team invite details");
  addRoute("post", "/api/teams/invite/{code}/join", "Join team via invite code", { security: true });
  addRoute("get", "/api/teams/mine", "Get my team memberships", { security: true });
  addRoute("post", "/api/teams/{teamId}/invite/rotate", "Rotate team invite code", { security: true });
  addRoute("delete", "/api/teams/{teamId}/members/me", "Leave team", { security: true });

  // ─── Projects (mounted at /api/projects) ───
  addRoute("get", "/api/projects", "Public project gallery");
  addRoute("get", "/api/projects/{projectId}", "Get project details");
  addRoute("post", "/api/projects", "Create project draft", { security: true, body: createProjectBodySchema });
  addRoute("patch", "/api/projects/{projectId}", "Update project draft", { security: true, body: patchProjectBodySchema });
  addRoute("post", "/api/projects/{projectId}/submit", "Submit project", { security: true });
  addRoute("post", "/api/projects/{projectId}/clear-duplicate", "Clear duplicate flag", { security: true });

  // ─── Community / Voting / Comments (mounted at /api) ───
  addRoute("get", "/api/events/{eventId}/ballot", "Get voter ballot for event", { security: true });
  addRoute("post", "/api/events/{eventId}/votes", "Cast vote for project in event", { security: true, body: castVoteBodySchema });
  addRoute("delete", "/api/events/{eventId}/votes/{trackId}", "Retract vote for track", { security: true });
  addRoute("get", "/api/projects/{projectId}/comments", "Get project comments");
  addRoute("post", "/api/projects/{projectId}/comments", "Add comment to project", { security: true, body: createCommentBodySchema });
  addRoute("delete", "/api/comments/{commentId}", "Delete own comment", { security: true });
  addRoute("post", "/api/comments/{commentId}/hide", "Hide comment", { security: true, body: hideCommentBodySchema });
  addRoute("post", "/api/comments/{commentId}/unhide", "Unhide comment", { security: true });
  addRoute("get", "/api/events/{eventId}/comments", "List all comments for event", { security: true });
  addRoute("get", "/api/events/{eventId}/community-results", "Get community voting results");
  addRoute("get", "/api/events/{eventId}/community-turnout", "Get community voting turnout", { security: true });
  addRoute("get", "/api/events/{eventId}/votes/flagged", "List flagged votes", { security: true });
  addRoute("post", "/api/votes/{voteId}/void", "Void suspicious vote", { security: true, body: voidVoteBodySchema });
  addRoute("post", "/api/votes/{voteId}/restore", "Restore voided vote", { security: true });

  // ─── Assignments (standalone at /api/assignments) ───
  addRoute("delete", "/api/assignments/{assignmentId}", "Delete assignment", { security: true });

  // ─── Judge invites (mounted at /api/judge-invites) ───
  addRoute("get", "/api/judge-invites/{token}", "Get judge invite details");
  addRoute("post", "/api/judge-invites/{token}/accept", "Accept judge invite", { security: true });

  // ─── Judge (mounted at /api/judge) ───
  addRoute("get", "/api/judge/assignments", "Get assignments for logged-in judge", { security: true });
  addRoute("get", "/api/judge/assignments/{assignmentId}", "Get single assignment details", { security: true });
  addRoute("put", "/api/judge/assignments/{assignmentId}/scores", "Submit assignment scores", { security: true, body: scoreUpdateBodySchema });
  addRoute("get", "/api/judge/scores", "Get submitted scores for judge", { security: true });

  // ─── Webhooks (event-scoped via mountWebhooksOnEvents, standalone via /api) ───
  addRoute("get", "/api/events/{eventId}/webhooks", "List webhooks for event", { security: true });
  addRoute("post", "/api/events/{eventId}/webhooks", "Create webhook for event", { security: true, body: createWebhookSchema });
  addRoute("get", "/api/webhooks/{id}", "Get webhook detail", { security: true });
  addRoute("patch", "/api/webhooks/{id}", "Update webhook", { security: true, body: updateWebhookSchema });
  addRoute("delete", "/api/webhooks/{id}", "Delete webhook", { security: true });
  addRoute("post", "/api/webhooks/{id}/test", "Test webhook ping", { security: true });
  addRoute("get", "/api/webhooks/{id}/deliveries", "List deliveries for webhook", { security: true });
  addRoute("post", "/api/webhook-deliveries/{id}/redeliver", "Redeliver webhook delivery", { security: true });

  // ─── Embed (mounted at /api/embed and /) ───
  addRoute("get", "/api/embed/gallery", "Get embeddable gallery data");

  // ─── OpenAPI self route ───
  addRoute("get", "/api/openapi.json", "Get OpenAPI 3.1 JSON specification");

  // ─── Embed script (non-JSON, mounted at /) ───
  addRoute("get", "/embed.js", "Embeddable gallery widget script", {
    responses: {
      200: { description: "JavaScript widget", content: { "application/javascript": { schema: z.string() } } },
    },
  });

  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      version: "1.0.0",
      title: "DOGFOOD Hackathon Portal REST API",
      description: "Self-hosted, offline hackathon submission and judging portal REST API.",
    },
    servers: [{ url: "/" }],
  });
}
