import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  type ResponseConfig,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  createApiKeyBodySchema,
  createCommentBodySchema,
  createEventBodySchema,
  createPrizeBodySchema,
  createProjectBodySchema,
  createTeamBodySchema,
  createTrackBodySchema,
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
  scoreUpdateBodySchema,
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
                content: { "application/json": { schema: opts.body } },
              },
            }
          : {}),
      },
      responses: responses as Record<string, ResponseConfig>,
    });
  };

  // Health
  addRoute("get", "/api/health", "Health check");

  // Auth
  addRoute("post", "/api/auth/register", "Register a new user", { body: registerBodySchema });
  addRoute("post", "/api/auth/login", "Log in user", { body: loginBodySchema });
  addRoute("post", "/api/auth/logout", "Log out user", { security: true });
  addRoute("get", "/api/auth/me", "Get current user profile", { security: true });

  // Admin
  addRoute("get", "/api/admin/users", "List all users", { security: true });
  addRoute("patch", "/api/admin/users/{userId}", "Update user role", { security: true, body: patchUserBodySchema });

  // Events
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

  // API Keys
  addRoute("get", "/api/events/{eventId}/api-keys", "List API keys for event", { security: true });
  addRoute("post", "/api/events/{eventId}/api-keys", "Create API key for event", { security: true, body: createApiKeyBodySchema });
  addRoute("delete", "/api/api-keys/{id}", "Revoke API key", { security: true });

  // Teams
  addRoute("get", "/api/teams/invite/{code}", "Get team invite details");
  addRoute("post", "/api/teams/invite/{code}/join", "Join team via invite code", { security: true });
  addRoute("get", "/api/teams/mine", "Get my team memberships", { security: true });
  addRoute("post", "/api/teams/{teamId}/invite/rotate", "Rotate team invite code", { security: true });
  addRoute("delete", "/api/teams/{teamId}/members/me", "Leave team", { security: true });

  // Projects
  addRoute("get", "/api/projects", "Public project gallery");
  addRoute("get", "/api/projects/{projectId}", "Get project details");
  addRoute("post", "/api/projects", "Create project draft", { security: true, body: createProjectBodySchema });
  addRoute("patch", "/api/projects/{projectId}", "Update project draft", { security: true, body: patchProjectBodySchema });
  addRoute("post", "/api/projects/{projectId}/submit", "Submit project", { security: true });
  addRoute("post", "/api/projects/{projectId}/clear-duplicate", "Clear duplicate flag", { security: true });

  // Judging & Rubric
  addRoute("get", "/api/events/{eventId}/rubric", "Get rubric criteria");
  addRoute("put", "/api/events/{eventId}/rubric", "Update rubric criteria", { security: true, body: putCriteriaBodySchema });
  addRoute("get", "/api/events/{eventId}/judge-invites", "List judge invites", { security: true });
  addRoute("post", "/api/events/{eventId}/judge-invites", "Create judge invite", { security: true, body: judgeInviteBodySchema });
  addRoute("put", "/api/events/{eventId}/judges/{judgeId}/tracks", "Update judge track assignments", { security: true, body: judgeTracksBodySchema });
  addRoute("delete", "/api/events/{eventId}/judges/{judgeId}", "Remove judge from event", { security: true });
  addRoute("get", "/api/events/{eventId}/assignments", "List event assignments", { security: true });
  addRoute("post", "/api/events/{eventId}/assignments/generate", "Auto generate assignments", { security: true });
  addRoute("post", "/api/events/{eventId}/assignments/manual", "Create manual assignment", { security: true, body: manualAssignmentBodySchema });
  addRoute("get", "/api/events/{eventId}/dashboard", "Organizer live dashboard", { security: true });
  addRoute("post", "/api/events/{eventId}/results/publish", "Publish event results", { security: true });
  addRoute("post", "/api/events/{eventId}/results/unpublish", "Unpublish event results", { security: true });
  addRoute("get", "/api/events/{eventId}/results", "Get published or organizer results");
  addRoute("get", "/api/events/{eventId}/export.csv", "Export scores CSV", { security: true });
  addRoute("get", "/api/events/{eventId}/audit", "Get event audit log", { security: true });

  // Assignments & Judge routes
  addRoute("delete", "/api/assignments/{assignmentId}", "Delete assignment", { security: true });
  addRoute("get", "/api/judge-invites/{token}", "Get judge invite details");
  addRoute("post", "/api/judge-invites/{token}/accept", "Accept judge invite", { security: true });
  addRoute("get", "/api/judge/assignments", "Get assignments for logged-in judge", { security: true });
  addRoute("get", "/api/judge/assignments/{assignmentId}", "Get single assignment details", { security: true });
  addRoute("put", "/api/judge/assignments/{assignmentId}", "Submit assignment scores", { security: true, body: scoreUpdateBodySchema });
  addRoute("get", "/api/judge/scores", "Get submitted scores for judge", { security: true });

  // Community / Voting / Moderation
  addRoute("post", "/api/projects/{projectId}/votes", "Cast vote for project", { security: true });
  addRoute("get", "/api/events/{eventId}/my-votes", "Get user votes for event", { security: true });
  addRoute("post", "/api/projects/{projectId}/comments", "Add comment to project", { security: true, body: createCommentBodySchema });
  addRoute("get", "/api/projects/{projectId}/comments", "Get project comments");
  addRoute("post", "/api/comments/{commentId}/hide", "Hide comment", { security: true, body: hideCommentBodySchema });
  addRoute("post", "/api/comments/{commentId}/unhide", "Unhide comment", { security: true });
  addRoute("get", "/api/events/{eventId}/community-results", "Get community voting results");
  addRoute("get", "/api/events/{eventId}/community-turnout", "Get community voting turnout", { security: true });
  addRoute("get", "/api/events/{eventId}/votes/flagged", "List flagged votes", { security: true });
  addRoute("post", "/api/votes/{voteId}/void", "Void suspicious vote", { security: true });
  addRoute("post", "/api/votes/{voteId}/restore", "Restore voided vote", { security: true });

  // OpenAPI self route
  addRoute("get", "/api/openapi.json", "Get OpenAPI 3.1 JSON specification");

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
