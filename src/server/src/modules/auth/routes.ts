import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginBodySchema, registerBodySchema } from "@dogfood/shared";
import { requireAuth } from "../../middleware/authorize.js";
import { validateBody } from "../../middleware/validate.js";
import * as authService from "./service.js";

const authRateLimit = rateLimit({
  windowMs: 60_000,
  limit: () => (process.env.TEST_RATE_LIMIT === "1" ? 10 : process.env.NODE_ENV === "test" ? 10_000 : 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "rate_limited",
      message: "Too many requests, try again later",
    },
  },
});

export const authRouter = Router();

authRouter.post(
  "/register",
  authRateLimit,
  validateBody(registerBodySchema),
  async (req, res) => {
    const result = await authService.register(req, req.body);
    res.status(201).json(result);
  },
);

authRouter.post("/login", authRateLimit, validateBody(loginBodySchema), async (req, res) => {
  const result = await authService.login(req, req.body);
  res.status(200).json(result);
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  await authService.logout(req);
  res.status(204).send();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const result = await authService.me(req);
  res.status(200).json(result);
});
