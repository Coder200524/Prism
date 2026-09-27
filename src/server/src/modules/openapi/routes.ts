import express, { Router } from "express";
import { getAbsoluteFSPath } from "swagger-ui-dist";
import { generateOpenApiSpec } from "./generator.js";

export const openapiRouter = Router();

const swaggerDistPath = getAbsoluteFSPath();

const customSwaggerHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>DOGFOOD API Documentation</title>
    <link rel="stylesheet" type="text/css" href="/api/docs/swagger-ui.css" />
    <link rel="icon" type="image/png" href="/api/docs/favicon-32x32.png" sizes="32x32" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api/docs/swagger-ui-bundle.js" charset="UTF-8"></script>
    <script src="/api/docs/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
    <script src="/api/docs/swagger-initializer.js" charset="UTF-8"></script>
  </body>
</html>`;

const swaggerInitializerJs = `window.onload = function() {
  window.ui = SwaggerUIBundle({
    url: "/api/openapi.json",
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [
      SwaggerUIBundle.presets.apis,
      SwaggerUIStandalonePreset
    ],
    layout: "StandaloneLayout"
  });
};`;

openapiRouter.get("/openapi.json", (_req, res) => {
  const spec = generateOpenApiSpec();
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(spec, null, 2));
});

openapiRouter.get("/docs/swagger-initializer.js", (_req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.send(swaggerInitializerJs);
});

openapiRouter.get("/docs", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(customSwaggerHtml);
});

openapiRouter.get("/docs/index.html", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(customSwaggerHtml);
});

openapiRouter.use("/docs", express.static(swaggerDistPath));
