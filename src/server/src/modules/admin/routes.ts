import { Router } from "express";
import { patchUserBodySchema } from "@dogfood/shared";
import { requireAuth, requirePlatformRole } from "../../middleware/authorize.js";
import { validateBody } from "../../middleware/validate.js";
import * as adminService from "./service.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requirePlatformRole("ADMIN"));

adminRouter.get("/users", async (_req, res) => {
  const users = await adminService.listUsers();
  res.status(200).json({ users });
});

adminRouter.patch("/users/:userId", validateBody(patchUserBodySchema), async (req, res) => {
  const user = await adminService.updatePlatformRole(
    req,
    req.params.userId as string,
    req.body.platformRole,
  );
  res.status(200).json({ user });
});
