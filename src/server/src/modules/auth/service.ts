import bcrypt from "bcryptjs";
import type { PlatformRole } from "@prisma/client";
import type { Request } from "express";
import {
  loginBodySchema,
  registerBodySchema,
  type LoginBody,
  type RegisterBody,
} from "@dogfood/shared";
import { audit } from "../../lib/audit.js";
import { clock } from "../../lib/clock.js";
import { conflict, HttpError, unauthorized } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { generateToken, hashToken } from "../../lib/tokens.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;
// Precomputed bcrypt so unknown-email logins still pay the compare cost.
const DUMMY_PASSWORD_HASH =
  "$2b$10$70mooqkbF7SNNpyksPr6lOszSwgN.OpYE7bwbgnZWfpJgAwE3MdG2";

function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  platformRole: PlatformRole;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    platformRole: user.platformRole,
    createdAt: user.createdAt.toISOString(),
  };
}

async function createSession(userId: string): Promise<string> {
  const token = generateToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(clock.now().getTime() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { userId, tokenHash, expiresAt },
  });
  return token;
}

export async function register(req: Request, body: RegisterBody) {
  const parsed = registerBodySchema.parse(body);
  const existing = await prisma.user.findUnique({
    where: { email: parsed.email.toLowerCase() },
    select: { id: true },
  });
  if (existing) {
    throw conflict("email_taken", "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(parsed.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email: parsed.email.toLowerCase(),
      name: parsed.name,
      passwordHash,
    },
  });

  const token = await createSession(user.id);
  req.user = user;
  await audit(req, "auth.register", { type: "user", id: user.id }, { email: user.email });

  return { token, user: toPublicUser(user) };
}

export async function login(req: Request, body: LoginBody) {
  const parsed = loginBodySchema.parse(body);
  const user = await prisma.user.findUnique({
    where: { email: parsed.email.toLowerCase() },
  });

  const hash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const ok = await bcrypt.compare(parsed.password, hash);
  if (!user || !ok) {
    throw new HttpError(401, "invalid_credentials", "Invalid email or password");
  }

  const token = await createSession(user.id);
  req.user = user;
  await audit(req, "auth.login", { type: "user", id: user.id });

  return { token, user: toPublicUser(user) };
}

export async function logout(req: Request): Promise<void> {
  if (!req.session) {
    throw unauthorized();
  }
  await prisma.session.delete({ where: { id: req.session.id } });
  await audit(req, "auth.logout", { type: "user", id: req.user?.id });
}

export async function me(req: Request) {
  if (!req.user) {
    throw unauthorized();
  }

  const roles = await prisma.eventRole.findMany({
    where: { userId: req.user.id },
    select: { eventId: true, role: true },
    orderBy: [{ eventId: "asc" }, { role: "asc" }],
  });

  return {
    user: toPublicUser(req.user),
    roles,
  };
}
