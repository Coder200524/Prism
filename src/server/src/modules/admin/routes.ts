import { Router } from "express";
import { patchUserBodySchema } from "@dogfood/shared";
import { audit } from "../../lib/audit.js";
import { requireAuth, requirePlatformRole } from "../../middleware/authorize.js";
import { validateBody } from "../../middleware/validate.js";
import * as adminService from "./service.js";
import * as recordsService from "../records/records.service.js";

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

adminRouter.post("/records/keys/rotate", async (req, res) => {
  const key = await recordsService.rotateSigningKey();
  await audit(req, "records.key_rotate", { type: "signing_key", id: key.id });
  res.status(200).json({
    kid: key.id,
    createdAt: key.createdAt.toISOString(),
    retiredAt: key.retiredAt?.toISOString() ?? null,
  });
});
