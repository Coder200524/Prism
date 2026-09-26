import type { NextFunction, Request, Response } from "express";
import { clock } from "../lib/clock.js";
import { prisma } from "../lib/prisma.js";
import { hashToken } from "../lib/tokens.js";

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    next();
    return;
  }

  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          platformRole: true,
          createdAt: true,
        },
      },
    },
  });

  if (!session || session.expiresAt <= clock.now()) {
    next();
    return;
  }

  req.user = session.user;
  req.session = { id: session.id, tokenHash: session.tokenHash };
  next();
}
