import { describe, expect, it } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/index.js";
import { generateOpenApiSpec } from "../../src/server/src/modules/openapi/generator.js";

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

  it("ensures every registered /api route is present in the OpenAPI spec", () => {
    const spec = generateOpenApiSpec();
    const specPaths = Object.keys(spec.paths || {});

    const normalizedSpecPaths = new Set(
      specPaths.map((p) => p.replace(/{[^}]+}/g, ":param")),
    );

    function collectRoutes(layer: any, prefix = ""): Array<{ method: string; path: string }> {
      const routes: Array<{ method: string; path: string }> = [];
      if (layer.route) {
        const fullPath = (prefix + layer.route.path).replace(/\/+/g, "/");
        for (const method of Object.keys(layer.route.methods)) {
          if (layer.route.methods[method]) {
            routes.push({ method: method.toLowerCase(), path: fullPath });
          }
        }
      } else if (layer.name === "router" && layer.handle?.stack) {
        let routePrefix = prefix;
        if (layer.regexp && layer.regexp.source) {
          const src = layer.regexp.source;
          const match = src
            .replace("^\\", "")
            .replace("\\/?(?=\\/|$)", "")
            .replace("(?=\\/|$)", "")
            .replace(/\\\//g, "/")
            .replace(/\(\?:\[\^\\\/\]\+\)/g, ":param");
          if (match && match !== "^/" && match !== "^") {
            routePrefix = (prefix + "/" + match).replace(/\/+/g, "/");
          }
        }
        for (const subLayer of layer.handle.stack) {
          routes.push(...collectRoutes(subLayer, routePrefix));
        }
      }
      return routes;
    }

    const allRoutes: Array<{ method: string; path: string }> = [];
    const stack = (app as any)._router?.stack || (app as any).router?.stack || (app as any).stack || [];
    for (const layer of stack) {
      allRoutes.push(...collectRoutes(layer, ""));
    }

    const apiRoutes = allRoutes.filter((r) => r.path.startsWith("/api"));

    const missingRoutes: string[] = [];
    for (const route of apiRoutes) {
      if (route.path === "/api/openapi.json" || route.path.startsWith("/api/docs")) {
        continue;
      }

      const normalizedPath = route.path
        .replace(/:[a-zA-Z0-9_]+/g, ":param")
        .replace(/\/+/g, "/");

      let found = false;
      for (const specPath of normalizedSpecPaths) {
        const normSpec = specPath.replace(/\/+/g, "/");
        if (normSpec === normalizedPath) {
          found = true;
          break;
        }
      }

      if (!found) {
        missingRoutes.push(`${route.method.toUpperCase()} ${route.path} (normalized: ${normalizedPath})`);
      }
    }

    expect(missingRoutes, `Routes missing from OpenAPI spec:\n${missingRoutes.join("\n")}`).toEqual([]);
  });
});
