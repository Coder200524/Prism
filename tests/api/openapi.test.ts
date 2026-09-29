import { describe, expect, it } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/index.js";
import { generateOpenApiSpec } from "../../src/server/src/modules/openapi/generator.js";

/**
 * Paths that are not regular API routes and should be excluded from
 * the two-way comparison. Static asset serving, Swagger UI assets,
 * and the SPA catch-all are infrastructure, not API endpoints.
 */
const EXCLUDED_PREFIXES = ["/api/docs"];
const EXCLUDED_PATHS = new Set(["/api/openapi.json"]);

/** Normalise Express :param to OpenAPI {param} style. */
function expressToOpenApi(path: string): string {
  return path.replace(/:([a-zA-Z0-9_]+)/g, "{$1}").replace(/\/+/g, "/");
}

/** 
 * Express 5 drops the string mount paths in router layers. 
 * We infer a router's mount path by fingerprinting its unique terminal routes.
 */
function inferPrefix(layer: any): string {
  if (!layer.handle || !layer.handle.stack) return "";
  const routes = layer.handle.stack.filter((l: any) => l.route).map((l: any) => l.route.path);
  
  if (routes.includes("/openapi.json")) return "/api";
  if (routes.includes("/register")) return "/api/auth";
  if (routes.includes("/users")) return "/api/admin";
  if (routes.includes("/keys") && routes.includes("/verify")) return "/api/records";
  if (routes.includes("/certificates") && routes.includes("/records")) return "/api/me";
  if (routes.includes("/import")) return "/api";
  if (routes.includes("/import.json")) return "/:eventId"; // eventTransferRouter
  if (routes.includes("/:eventId/publish")) return "/api/events";
  if (routes.includes("/mine")) return "/api/teams";
  if (routes.includes("/:projectId/submit")) return "/api/projects";
  if (routes.includes("/scores")) return "/api/judge";
  if (routes.includes("/:token/accept")) return "/api/judge-invites";
  if (routes.includes("/:assignmentId")) return "/api/assignments";
  if (routes.includes("/gallery")) return "/api/embed";
  if (routes.includes("/webhooks/:id")) return "/api"; // webhooksRouter
  if (routes.includes("/events/:eventId/ballot")) return "/api"; // communityRouter

  
  // apiKeysRouter (has DELETE /:id) vs eventApiKeysRouter (GET /, POST /)
  if (routes.includes("/:id") && !routes.includes("/:id/test")) {
    return "/api/api-keys"; 
  }
  // eventApiKeysRouter has GET / and POST / and NO /:id
  if (routes.includes("/") && routes.length === 2) {
    return "/:eventId/api-keys";
  }

  return "";
}

/** Collect every route from the Express app stack recursively. */
function collectRoutes(layer: any, prefix = ""): Array<{ method: string; path: string }> {
  const routes: Array<{ method: string; path: string }> = [];

  if (layer.route) {
    let fullPath = (prefix + layer.route.path).replace(/\/+/g, "/");
    if (fullPath.length > 1 && fullPath.endsWith("/")) {
      fullPath = fullPath.slice(0, -1);
    }
    for (const method of Object.keys(layer.route.methods)) {
      if (layer.route.methods[method]) {
        routes.push({ method: method.toLowerCase(), path: fullPath });
      }
    }
  } else if (layer.name === "router" && layer.handle?.stack) {
    let routePrefix = prefix;
    const inferred = inferPrefix(layer);
    if (inferred) {
      routePrefix = (prefix + "/" + inferred).replace(/\/+/g, "/");
    }
    for (const subLayer of layer.handle.stack) {
      routes.push(...collectRoutes(subLayer, routePrefix));
    }
  }

  return routes;
}

/**
 * Extract the set of "method path" strings from the Express app,
 * normalised to OpenAPI {param} form and filtered to /api routes only.
 */
function getAppRoutes(app: any): Set<string> {
  // Ensure the app is initialized by triggering a dummy mount
  app.use(function dummyInit() {});

  const stack = app._router?.stack || app.router?.stack || app.stack || [];
  console.log("TOP LEVEL STACK LENGTH:", stack.length);
  
  const all: Array<{ method: string; path: string }> = [];
  for (const layer of stack) {
    const found = collectRoutes(layer, "");
    all.push(...found);
  }

  console.log("TOTAL ROUTES COLLECTED:", all.length);
  if (all.length > 0) {
    console.log("RAW EXTRACTED PATHS:", all.slice(10, 20).map(r => r.path));
  }

  const result = new Set<string>();
  for (const r of all) {
    const normalised = expressToOpenApi(r.path);
    if (EXCLUDED_PATHS.has(normalised)) continue;
    if (EXCLUDED_PREFIXES.some((p) => normalised.startsWith(p))) continue;
    if (!normalised.startsWith("/api") && normalised !== "/embed.js") continue;
    result.add(`${r.method.toUpperCase()} ${normalised}`);
  }
  return result;
}

/**
 * Extract the set of "method path" strings from the generated OpenAPI spec.
 */
function getSpecRoutes(): Set<string> {
  const spec = generateOpenApiSpec();
  const result = new Set<string>();
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    if (EXCLUDED_PATHS.has(path)) continue;
    if (EXCLUDED_PREFIXES.some((p) => path.startsWith(p))) continue;
    for (const method of Object.keys(methods as object)) {
      if (["get", "post", "put", "patch", "delete"].includes(method)) {
        result.add(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  return result;
}

describe("OpenAPI 3.1 and Swagger UI (/api/openapi.json & /api/docs)", () => {
  const app = getTestApp();

  it("serves valid OpenAPI 3.1 JSON spec", async () => {
    const res = await request(app).get("/api/openapi.json");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("application/json");
    expect(res.body.openapi).toBe("3.1.0");
    expect(res.body.info.title).toBeDefined();
    expect(res.body.paths).toBeDefined();
  });

  it("serves Swagger UI at /api/docs under strict CSP", async () => {
    const res = await request(app).get("/api/docs");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/html");
    expect(res.text).toContain("swagger-ui");
    expect(res.text).toContain("swagger-initializer.js");
    expect(res.text).not.toContain("<script>window.onload");
  });

  it("documents every real /api route (no undocumented routes)", () => {
    const appRoutes = getAppRoutes(app);
    const specRoutes = getSpecRoutes();

    const undocumented: string[] = [];
    for (const route of appRoutes) {
      if (!specRoutes.has(route)) {
        undocumented.push(route);
      }
    }

    expect(
      undocumented,
      `Real routes missing from OpenAPI spec:\n${undocumented.join("\n")}`,
    ).toEqual([]);
  });

  it("has no phantom routes in the spec (no documented route without a real handler)", () => {
    const appRoutes = getAppRoutes(app);
    const specRoutes = getSpecRoutes();

    const phantoms: string[] = [];
    for (const route of specRoutes) {
      if (!appRoutes.has(route)) {
        phantoms.push(route);
      }
    }

    expect(
      phantoms,
      `Documented routes not found in the app:\n${phantoms.join("\n")}`,
    ).toEqual([]);
  });

  it("declares BearerAuth security scheme", () => {
    const spec = generateOpenApiSpec();
    const schemes = (spec.components as Record<string, unknown>)?.securitySchemes as Record<string, unknown> | undefined;
    expect(schemes).toBeDefined();
    expect(schemes?.BearerAuth).toBeDefined();
  });

  it("includes error response shape on all paths", () => {
    const spec = generateOpenApiSpec();
    for (const [path, methods] of Object.entries(spec.paths || {})) {
      for (const [method, operation] of Object.entries(methods as Record<string, any>)) {
        if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
        const responses = operation.responses || {};
        const has4xx = Object.keys(responses).some(
          (code) => Number(code) >= 400 && Number(code) < 500,
        );
        expect(has4xx, `${method.toUpperCase()} ${path} should have at least one 4xx response`).toBe(true);
      }
    }
  });
});
