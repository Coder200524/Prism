import { Router, type Request, type Response } from "express";
import { getEmbedGallery } from "./embed.service.js";

export const embedRouter = Router();

embedRouter.get("/embed/gallery", async (req: Request, res: Response) => {
  const result = await getEmbedGallery({
    eventId: req.query.eventId as string | undefined,
    trackId: req.query.trackId as string | undefined,
    theme: req.query.theme as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  res.status(200).json(result);
});

embedRouter.get("/embed.js", (_req: Request, res: Response) => {
  const js = `(function() {
  var containers = document.querySelectorAll("[data-dogfood-gallery]");
  containers.forEach(function(container) {
    var eventId = container.getAttribute("data-event") || "";
    var trackId = container.getAttribute("data-track") || "";
    var theme = container.getAttribute("data-theme") || "light";
    var limit = container.getAttribute("data-limit") || "10";

    var scriptSrc = document.currentScript ? document.currentScript.src : "";
    var origin = scriptSrc ? new URL(scriptSrc).origin : window.location.origin;

    var iframe = document.createElement("iframe");
    iframe.src = origin + "/embed/gallery?eventId=" + encodeURIComponent(eventId) +
                 "&trackId=" + encodeURIComponent(trackId) +
                 "&theme=" + encodeURIComponent(theme) +
                 "&limit=" + encodeURIComponent(limit);
    iframe.style.width = "100%";
    iframe.style.border = "none";
    iframe.style.overflow = "hidden";
    iframe.style.minHeight = "200px";
    iframe.setAttribute("title", "Project Gallery Widget");

    container.innerHTML = "";
    container.appendChild(iframe);

    window.addEventListener("message", function(e) {
      if (e.origin !== origin) return;
      if (e.data && e.data.type === "dogfood:resize" && typeof e.data.height === "number") {
        iframe.style.height = e.data.height + "px";
      }
    });
  });
})();`;

  res.setHeader("Content-Type", "application/javascript");
  res.status(200).send(js);
});
