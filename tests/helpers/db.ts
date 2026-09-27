import { prisma } from "../../src/server/src/lib/prisma.js";

const TABLES = [
  "WebhookDelivery",
  "Webhook",
  "Vote",
  "Comment",
  "Record",
  "SigningKey",
  "ApiKey",
  "CriterionScore",
  "Assignment",
  "Criterion",
  "JudgeTrack",
  "JudgeInvite",
  "AuditLog",
  "Project",
  "TeamMember",
  "Team",
  "EventRole",
  "Prize",
  "Track",
  "Session",
  "Event",
  "User",
] as const;

export async function resetDatabase(): Promise<void> {
  const quoted = TABLES.map((name) => `"${name}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} CASCADE`);
}
