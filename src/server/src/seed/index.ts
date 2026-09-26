import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import {
  AssignmentStatus,
  EventRoleType,
  PlatformRole,
  ProjectStatus,
} from "@prisma/client";
import { clock } from "../lib/clock.js";
import { prisma } from "../lib/prisma.js";
import { hashToken } from "../lib/tokens.js";
import { findDuplicates } from "../modules/projects/duplicates.js";
import {
  equalWeightsSummingTo100,
  loadFixtures,
  titleCaseKey,
  type Fixtures,
} from "./fixtures.js";

const DEMO_PASSWORD = "dogfood-demo";
const DEMO_OPEN_HACK_ID = "evt_demo";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 365 * MS_PER_DAY;

const DEMO_TOKENS = {
  organizer: "demo-organizer-token",
  judgeA: "demo-judge-a-token",
  judgeB: "demo-judge-b-token",
  participant: "demo-participant-token",
} as const;

async function upsertUser(input: {
  id?: string;
  email: string;
  name: string;
  passwordHash: string;
  platformRole?: PlatformRole;
}): Promise<{ id: string; email: string; name: string }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        passwordHash: input.passwordHash,
        ...(input.platformRole !== undefined
          ? { platformRole: input.platformRole }
          : {}),
      },
      select: { id: true, email: true, name: true },
    });
  }
  return prisma.user.create({
    data: {
      id: input.id,
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      platformRole: input.platformRole ?? PlatformRole.USER,
    },
    select: { id: true, email: true, name: true },
  });
}

async function upsertEventRole(
  userId: string,
  eventId: string,
  role: EventRoleType,
): Promise<void> {
  await prisma.eventRole.upsert({
    where: {
      userId_eventId_role: { userId, eventId, role },
    },
    create: { userId, eventId, role },
    update: {},
  });
}

async function resolveUniqueTeamName(
  eventId: string,
  name: string,
  teamId: string,
): Promise<string> {
  const clash = await prisma.team.findFirst({
    where: {
      eventId,
      name,
      NOT: { id: teamId },
    },
    select: { id: true },
  });
  if (!clash) return name;
  return `${name} (${teamId})`;
}

async function seedFixtureEvent(
  fixtures: Fixtures,
  passwordHash: string,
  seedTime: Date,
): Promise<{
  eventId: string;
  judgeAId: string;
  judgeBId: string;
  participantEmail: string;
  participantId: string;
  counts: {
    tracks: number;
    judges: number;
    teams: number;
    projects: number;
    scores: number;
    criteria: number;
    duplicates: number;
  };
}> {
  const earliestSubmitted = fixtures.projects
    .map((project) => project.submitted_at)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const submissionsOpen = fixtures.event.submissions_open
    ? new Date(fixtures.event.submissions_open)
    : new Date((earliestSubmitted ?? seedTime).getTime() - 7 * MS_PER_DAY);

  await prisma.event.upsert({
    where: { id: fixtures.event.id },
    create: {
      id: fixtures.event.id,
      name: fixtures.event.name,
      description: fixtures.event.description ?? "",
      submissionsOpen,
      submissionsClose: new Date(fixtures.event.submissions_close),
      publishedAt: seedTime,
    },
    update: {},
  });

  for (const track of fixtures.tracks) {
    await prisma.track.upsert({
      where: { id: track.id },
      create: {
        id: track.id,
        eventId: fixtures.event.id,
        name: track.name,
        description: track.description ?? "",
      },
      update: {},
    });
  }

  const emailToUserId = new Map<string, string>();
  for (const judge of fixtures.judges) {
    const user = await upsertUser({
      id: judge.id,
      email: judge.email,
      name: judge.name,
      passwordHash,
    });
    emailToUserId.set(judge.email, user.id);
    await upsertEventRole(user.id, fixtures.event.id, EventRoleType.JUDGE);
    for (const trackId of judge.tracks) {
      await prisma.judgeTrack.upsert({
        where: { userId_trackId: { userId: user.id, trackId } },
        create: { userId: user.id, trackId, eventId: fixtures.event.id },
        update: {},
      });
    }
  }

  const judgeEmails = new Set(fixtures.judges.map((judge) => judge.email));
  let participantEmail = "";
  let participantId = "";
  const teamIdUsedByProject = new Set<string>();

  for (const team of fixtures.teams) {
    const uniqueName = await resolveUniqueTeamName(
      fixtures.event.id,
      team.name,
      team.id,
    );
    await prisma.team.upsert({
      where: { id: team.id },
      create: {
        id: team.id,
        eventId: fixtures.event.id,
        name: uniqueName,
        inviteCode: `inv_${team.id}`,
      },
      update: {},
    });

    for (const email of team.members) {
      let userId = emailToUserId.get(email);
      if (!userId) {
        const user = await upsertUser({
          email,
          name: email.split("@")[0] ?? email,
          passwordHash,
        });
        userId = user.id;
        emailToUserId.set(email, userId);
      }
      await upsertEventRole(userId, fixtures.event.id, EventRoleType.PARTICIPANT);
      await prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: team.id, userId } },
        create: { teamId: team.id, userId, eventId: fixtures.event.id },
        update: {},
      });

      if (!participantEmail && !judgeEmails.has(email)) {
        participantEmail = email;
        participantId = userId;
      }
    }
  }

  for (const project of fixtures.projects) {
    let teamId = project.team;
    if (teamIdUsedByProject.has(project.team)) {
      const syntheticId = `tm_dup_${project.id}`;
      const sourceTeam = fixtures.teams.find((team) => team.id === project.team);
      await prisma.team.upsert({
        where: { id: syntheticId },
        create: {
          id: syntheticId,
          eventId: fixtures.event.id,
          name: `${sourceTeam?.name ?? project.team} (duplicate entry)`,
          inviteCode: `inv_${syntheticId}`,
        },
        update: {},
      });
      teamId = syntheticId;
    }
    teamIdUsedByProject.add(project.team);

    const submittedAt = project.submitted_at ? new Date(project.submitted_at) : null;
    await prisma.project.upsert({
      where: { id: project.id },
      create: {
        id: project.id,
        eventId: fixtures.event.id,
        teamId,
        trackId: project.track ?? null,
        title: project.title,
        summary: project.summary ?? "",
        repoUrl: project.repo_url ?? "",
        demoUrl: project.demo_url ?? "",
        status: submittedAt ? ProjectStatus.SUBMITTED : ProjectStatus.DRAFT,
        submittedAt,
      },
      update: {},
    });
  }

  const criterionKeys: string[] = [];
  let minScore = 1;
  let maxScore = 5;
  let sawScore = false;
  for (const score of fixtures.scores) {
    for (const [key, value] of Object.entries(score.criteria)) {
      if (!criterionKeys.includes(key)) criterionKeys.push(key);
      if (!sawScore) {
        minScore = value;
        maxScore = value;
        sawScore = true;
      } else {
        minScore = Math.min(minScore, value);
        maxScore = Math.max(maxScore, value);
      }
    }
  }

  const weights = equalWeightsSummingTo100(criterionKeys.length);
  const criterionIdByKey = new Map<string, string>();
  for (let index = 0; index < criterionKeys.length; index += 1) {
    const key = criterionKeys[index];
    if (!key) continue;
    const criterion = await prisma.criterion.upsert({
      where: { eventId_key: { eventId: fixtures.event.id, key } },
      create: {
        id: `crt_${fixtures.event.id}_${key}`,
        eventId: fixtures.event.id,
        key,
        name: titleCaseKey(key),
        weight: weights[index] ?? 0,
        minScore,
        maxScore,
        position: index,
      },
      update: {},
    });
    criterionIdByKey.set(key, criterion.id);
  }

  for (const score of fixtures.scores) {
    const assignmentId = `asgn_${score.judge}_${score.project}`;
    await prisma.assignment.upsert({
      where: { id: assignmentId },
      create: {
        id: assignmentId,
        eventId: fixtures.event.id,
        judgeId: score.judge,
        projectId: score.project,
        status: AssignmentStatus.SUBMITTED,
        comment: score.comment ?? "",
        submittedAt: seedTime,
      },
      update: {},
    });

    for (const [key, value] of Object.entries(score.criteria)) {
      const criterionId = criterionIdByKey.get(key);
      if (!criterionId) continue;
      await prisma.criterionScore.upsert({
        where: {
          assignmentId_criterionId: { assignmentId, criterionId },
        },
        create: { assignmentId, criterionId, value },
        update: {},
      });
    }
  }

  const projectsForDup = await prisma.project.findMany({
    where: { eventId: fixtures.event.id },
    select: { id: true, title: true, repoUrl: true, submittedAt: true },
  });
  const duplicateMap = findDuplicates(projectsForDup);
  for (const project of projectsForDup) {
    await prisma.project.update({
      where: { id: project.id },
      data: { duplicateOfId: duplicateMap.get(project.id) ?? null },
    });
  }

  const firstJudge = fixtures.judges[0];
  const secondJudge = fixtures.judges[1];
  if (!firstJudge || !secondJudge) {
    throw new Error("fixtures.json must include at least two judges");
  }
  if (!participantId || !participantEmail) {
    throw new Error("could not find a non-judge team member for the demo participant");
  }

  return {
    eventId: fixtures.event.id,
    judgeAId: firstJudge.id,
    judgeBId: secondJudge.id,
    participantEmail,
    participantId,
    counts: {
      tracks: fixtures.tracks.length,
      judges: fixtures.judges.length,
      teams: fixtures.teams.length,
      projects: fixtures.projects.length,
      scores: fixtures.scores.length,
      criteria: criterionKeys.length,
      duplicates: duplicateMap.size,
    },
  };
}

async function seedDemoAccounts(
  passwordHash: string,
  fixtureEventId: string,
  judgeAId: string,
  judgeBId: string,
  participantId: string,
): Promise<{
  adminId: string;
  organizerId: string;
  judgeAId: string;
  judgeBId: string;
  participantId: string;
}> {
  const admin = await upsertUser({
    id: "usr_demo_admin",
    email: "admin@dogfood.local",
    name: "Demo Admin",
    passwordHash,
    platformRole: PlatformRole.ADMIN,
  });
  const organizer = await upsertUser({
    id: "usr_demo_organizer",
    email: "organizer@dogfood.local",
    name: "Demo Organizer",
    passwordHash,
    platformRole: PlatformRole.ORGANIZER,
  });
  await upsertEventRole(organizer.id, fixtureEventId, EventRoleType.ORGANIZER);

  return {
    adminId: admin.id,
    organizerId: organizer.id,
    judgeAId,
    judgeBId,
    participantId,
  };
}

async function seedDemoSessions(
  enabled: boolean,
  accounts: {
    organizerId: string;
    judgeAId: string;
    judgeBId: string;
    participantId: string;
  },
  seedTime: Date,
): Promise<void> {
  if (!enabled) return;
  const expiresAt = new Date(seedTime.getTime() + SESSION_TTL_MS);
  const sessions = [
    { token: DEMO_TOKENS.organizer, userId: accounts.organizerId },
    { token: DEMO_TOKENS.judgeA, userId: accounts.judgeAId },
    { token: DEMO_TOKENS.judgeB, userId: accounts.judgeBId },
    { token: DEMO_TOKENS.participant, userId: accounts.participantId },
  ];
  for (const session of sessions) {
    const tokenHash = hashToken(session.token);
    await prisma.session.upsert({
      where: { tokenHash },
      create: {
        tokenHash,
        userId: session.userId,
        expiresAt,
      },
      update: {},
    });
  }
}

async function seedDemoOpenHack(organizerId: string, seedTime: Date): Promise<void> {
  const submissionsClose = new Date(seedTime.getTime() + 7 * MS_PER_DAY);
  await prisma.event.upsert({
    where: { id: DEMO_OPEN_HACK_ID },
    create: {
      id: DEMO_OPEN_HACK_ID,
      name: "Demo Open Hack",
      description: "Live demo event with submissions open for 7 days.",
      submissionsOpen: seedTime,
      submissionsClose,
      publishedAt: seedTime,
      maxTeamSize: 4,
      reviewsPerProject: 3,
    },
    update: {},
  });

  await upsertEventRole(organizerId, DEMO_OPEN_HACK_ID, EventRoleType.ORGANIZER);

  const tracks = [
    { id: "trk_demo_general", name: "General" },
    { id: "trk_demo_special", name: "Special" },
  ];
  for (const track of tracks) {
    await prisma.track.upsert({
      where: { id: track.id },
      create: {
        id: track.id,
        eventId: DEMO_OPEN_HACK_ID,
        name: track.name,
      },
      update: {},
    });
  }

  const criteria = [
    { key: "functionality", name: "Functionality", weight: 40, position: 0 },
    { key: "design", name: "Design", weight: 30, position: 1 },
    { key: "impact", name: "Impact", weight: 30, position: 2 },
  ];
  for (const criterion of criteria) {
    await prisma.criterion.upsert({
      where: {
        eventId_key: { eventId: DEMO_OPEN_HACK_ID, key: criterion.key },
      },
      create: {
        id: `crt_${DEMO_OPEN_HACK_ID}_${criterion.key}`,
        eventId: DEMO_OPEN_HACK_ID,
        key: criterion.key,
        name: criterion.name,
        weight: criterion.weight,
        minScore: 1,
        maxScore: 5,
        position: criterion.position,
      },
      update: {},
    });
  }
}

function printSummary(input: {
  publicUrl: string;
  seedDemo: boolean;
  participantEmail: string;
  counts: {
    tracks: number;
    judges: number;
    teams: number;
    projects: number;
    scores: number;
    criteria: number;
    duplicates: number;
  };
}): void {
  const lines = [
    "┌────────────────────────────────────────────────────────────┐",
    "│ DOGFOOD Portal — seed complete                             │",
    `│ URL: ${input.publicUrl.padEnd(52)}│`,
    "│                                                            │",
    "│ Demo accounts (password: dogfood-demo)                     │",
    "│   admin@dogfood.local        ADMIN                         │",
    "│   organizer@dogfood.local    ORGANIZER                     │",
    "│   judge A / judge B          fixture judges 1 & 2          │",
    `│   participant                ${input.participantEmail.padEnd(28)}│`,
    "│                                                            │",
    ...(input.seedDemo
      ? [
          "│ Demo tokens (Authorization: Bearer …)                      │",
          "│   demo-organizer-token                                     │",
          "│   demo-judge-a-token                                       │",
          "│   demo-judge-b-token                                       │",
          "│   demo-participant-token                                   │",
          "│                                                            │",
        ]
      : [
          "│ Demo tokens: skipped (SEED_DEMO!=true)                     │",
          "│                                                            │",
        ]),
    "│ Fixture import counts                                      │",
    `│   tracks=${String(input.counts.tracks).padEnd(4)} judges=${String(input.counts.judges).padEnd(4)} teams=${String(input.counts.teams).padEnd(4)}          │`,
    `│   projects=${String(input.counts.projects).padEnd(3)} scores=${String(input.counts.scores).padEnd(4)} criteria=${String(input.counts.criteria).padEnd(2)} dups=${String(input.counts.duplicates).padEnd(2)}   │`,
    "│ Also seeded: Demo Open Hack (evt_demo)                     │",
    "└────────────────────────────────────────────────────────────┘",
  ];
  console.log(lines.join("\n"));
}

export async function runSeed(options?: {
  seedDemo?: boolean;
  publicUrl?: string;
}): Promise<void> {
  const seedDemo = options?.seedDemo ?? process.env.SEED_DEMO === "true";
  const publicUrl = options?.publicUrl ?? process.env.PUBLIC_URL ?? "http://localhost:8080";
  const seedTime = clock.now();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const fixtures = loadFixtures();

  const imported = await seedFixtureEvent(fixtures, passwordHash, seedTime);
  const accounts = await seedDemoAccounts(
    passwordHash,
    imported.eventId,
    imported.judgeAId,
    imported.judgeBId,
    imported.participantId,
  );
  await seedDemoSessions(seedDemo, accounts, seedTime);
  await seedDemoOpenHack(accounts.organizerId, seedTime);

  printSummary({
    publicUrl,
    seedDemo,
    participantEmail: imported.participantEmail,
    counts: imported.counts,
  });
}

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  runSeed()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error: unknown) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
