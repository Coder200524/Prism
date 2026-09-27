import bcrypt from "bcryptjs";
import {
  EventRoleType,
  PlatformRole,
  type PlatformRole as PlatformRoleType,
} from "@prisma/client";
import { clock } from "../../src/server/src/lib/clock.js";
import { prisma } from "../../src/server/src/lib/prisma.js";
import { generateToken, hashToken } from "../../src/server/src/lib/tokens.js";

const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const PASSWORD = "test-password-123";

export type TestUser = {
  id: string;
  email: string;
  name: string;
  platformRole: PlatformRoleType;
  token: string;
};

export async function createUser(input: {
  email: string;
  name: string;
  platformRole?: PlatformRoleType;
}): Promise<TestUser> {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash,
      platformRole: input.platformRole ?? PlatformRole.USER,
    },
  });
  const token = await createTokenForUser(user.id);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    platformRole: user.platformRole,
    token,
  };
}

export async function createTokenForUser(userId: string): Promise<string> {
  const token = generateToken(32);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(clock.now().getTime() + SESSION_TTL_MS),
    },
  });
  return token;
}

export function authHeader(token: string | null | undefined): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function grantEventRole(
  userId: string,
  eventId: string,
  role: EventRoleType,
): Promise<void> {
  await prisma.eventRole.upsert({
    where: { userId_eventId_role: { userId, eventId, role } },
    create: { userId, eventId, role },
    update: {},
  });
}

export async function createEvent(data?: Partial<{ name: string; description: string }>) {
  const now = clock.now();
  return prisma.event.create({
    data: {
      name: data?.name ?? "Test Event",
      description: data?.description ?? "",
      submissionsOpen: new Date(now.getTime() - 86400000),
      submissionsClose: new Date(now.getTime() + 86400000 * 7),
    },
  });
}

export { PASSWORD as TEST_PASSWORD, EventRoleType, PlatformRole };

