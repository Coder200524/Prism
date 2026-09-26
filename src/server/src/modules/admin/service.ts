import type { PlatformRole } from "@prisma/client";
import type { Request } from "express";
import { audit } from "../../lib/audit.js";
import { notFound } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";

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

export async function listUsers() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      platformRole: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return users.map(toPublicUser);
}

export async function updatePlatformRole(
  req: Request,
  userId: string,
  platformRole: PlatformRole,
) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!existing) {
    throw notFound("User not found");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { platformRole },
    select: {
      id: true,
      email: true,
      name: true,
      platformRole: true,
      createdAt: true,
    },
  });

  await audit(
    req,
    "admin.user.platform_role",
    { type: "user", id: user.id },
    { platformRole },
  );

  return toPublicUser(user);
}
