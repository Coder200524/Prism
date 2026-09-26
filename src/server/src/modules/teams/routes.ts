import { Router } from "express";
import { requireAuth } from "../../middleware/authorize.js";
import * as teamsService from "./service.js";

export const teamsRouter = Router();

teamsRouter.get("/invite/:code", async (req, res) => {
  const result = await teamsService.previewInvite(req.params.code as string);
  res.status(200).json(result);
});

teamsRouter.post("/invite/:code/join", requireAuth, async (req, res) => {
  const result = await teamsService.joinByInvite(req, req.params.code as string);
  res.status(200).json(result);
});

teamsRouter.get("/mine", requireAuth, async (req, res) => {
  const result = await teamsService.listMine(req);
  res.status(200).json(result);
});

teamsRouter.post("/:teamId/invite/rotate", requireAuth, async (req, res) => {
  const result = await teamsService.rotateInvite(req, req.params.teamId as string);
  res.status(200).json(result);
});

teamsRouter.delete("/:teamId/members/me", requireAuth, async (req, res) => {
  await teamsService.leaveTeam(req, req.params.teamId as string);
  res.status(204).send();
});
