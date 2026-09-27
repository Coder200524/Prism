import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request } from "express";
import { importEventSchema, type ImportEventInput } from "@dogfood/shared";
import { audit } from "../../lib/audit.js";
import { clock } from "../../lib/clock.js";
import { badRequest, notFound, unauthorized } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { generateToken, hashToken } from "../../lib/tokens.js";

async function generateUnusablePasswordHash(): Promise<string> {
  const random = crypto.randomBytes(32).toString("hex");
  return bcrypt.hash(random, 4);
}

export async function importData(req: Request, rawBody: unknown, dryRun: boolean) {
  if (!req.user) throw unauthorized();

  const parseResult = importEventSchema.safeParse(rawBody);
  if (!parseResult.success) {
    throw badRequest("Invalid import data format", parseResult.error.format());
  }

  const data: ImportEventInput = parseResult.data;

  // 1. Resolve or identify event
  const targetEventId = data.event.id ?? `evt_imp_${Date.now()}`;
  const existingEvent = await prisma.event.findFirst({
    where: { OR: [{ id: targetEventId }, { name: data.event.name }] },
  });

  const eventToCreate = !existingEvent;
  const eventId = existingEvent ? existingEvent.id : targetEventId;

  // 2. Identify users to create vs skip
  const allEmails = new Set<string>();
  for (const j of data.judges) allEmails.add(j.email.toLowerCase());
  for (const t of data.teams) {
    for (const m of t.members) allEmails.add(m.toLowerCase());
  }

  const existingUsers = await prisma.user.findMany({
    where: { email: { in: Array.from(allEmails) } },
    select: { id: true, email: true },
  });

  const existingEmailSet = new Set(existingUsers.map((u) => u.email.toLowerCase()));
  const usersToCreate: Array<{ email: string; name: string }> = [];

  for (const j of data.judges) {
    if (!existingEmailSet.has(j.email.toLowerCase())) {
      usersToCreate.push({ email: j.email.toLowerCase(), name: j.name });
      existingEmailSet.add(j.email.toLowerCase());
    }
  }

  for (const t of data.teams) {
    for (const email of t.members) {
      if (!existingEmailSet.has(email.toLowerCase())) {
        usersToCreate.push({ email: email.toLowerCase(), name: email.split("@")[0] ?? email });
        existingEmailSet.add(email.toLowerCase());
      }
    }
  }

  // 3. Identify tracks, prizes, criteria, teams, projects, scores
  const existingTracks = existingEvent
    ? await prisma.track.findMany({ where: { eventId }, select: { id: true, name: true } })
    : [];
  const existingTrackNames = new Set(existingTracks.map((t) => t.name.toLowerCase()));
  const tracksToCreate = data.tracks.filter((t) => !existingTrackNames.has(t.name.toLowerCase()));

  const existingTeams = existingEvent
    ? await prisma.team.findMany({ where: { eventId }, select: { id: true, name: true } })
    : [];
  const existingTeamNames = new Set(existingTeams.map((t) => t.name.toLowerCase()));
  const teamsToCreate = data.teams.filter((t) => !existingTeamNames.has(t.name.toLowerCase()));

  const existingProjects = existingEvent
    ? await prisma.project.findMany({ where: { eventId }, select: { id: true, title: true } })
    : [];
  const existingProjectTitles = new Set(existingProjects.map((p) => p.title.toLowerCase()));
  const projectsToCreate = data.projects.filter(
    (p) => !existingProjectTitles.has(p.title.toLowerCase()),
  );

  const existingScores = existingEvent
    ? await prisma.assignment.count({ where: { eventId, status: "SUBMITTED" } })
    : 0;

  const summary = {
    eventsToCreate: eventToCreate ? 1 : 0,
    usersToCreate: usersToCreate.length,
    tracksToCreate: tracksToCreate.length,
    prizesToCreate: data.prizes.length,
    criteriaToCreate: data.criteria.length,
    teamsToCreate: teamsToCreate.length,
    projectsToCreate: projectsToCreate.length,
    scoresToCreate: data.scores.length,
  };

  const skipped = {
    eventsSkipped: eventToCreate ? 0 : 1,
    usersSkipped: allEmails.size - usersToCreate.length,
    tracksSkipped: data.tracks.length - tracksToCreate.length,
    teamsSkipped: data.teams.length - teamsToCreate.length,
    projectsSkipped: data.projects.length - projectsToCreate.length,
    scoresSkipped: existingScores,
  };

  if (dryRun) {
    return {
      dryRun: true,
      summary,
      skipped,
      errors: [],
    };
  }

  // Real run inside single transaction
  const defaultPasswordHash = await generateUnusablePasswordHash();

  await prisma.$transaction(
    async (tx) => {
      // A. Create Event if missing
      if (eventToCreate) {
        const subOpen = data.event.submissionsOpen
          ? new Date(data.event.submissionsOpen)
          : new Date(clock.now().getTime() - 86400000 * 7);
        const subClose = data.event.submissionsClose
          ? new Date(data.event.submissionsClose)
          : data.event.submissions_close
            ? new Date(data.event.submissions_close)
            : new Date(clock.now().getTime() + 86400000 * 7);

        await tx.event.create({
          data: {
            id: targetEventId,
            name: data.event.name,
            description: data.event.description ?? "",
            maxTeamSize: data.event.maxTeamSize ?? 4,
            reviewsPerProject: data.event.reviewsPerProject ?? 3,
            submissionsOpen: subOpen,
            submissionsClose: subClose,
            judgingClose: data.event.judgingClose ? new Date(data.event.judgingClose) : null,
            votingOpen: data.event.votingOpen ? new Date(data.event.votingOpen) : null,
            votingClose: data.event.votingClose ? new Date(data.event.votingClose) : null,
            publishedAt: clock.now(),
          },
        });
      }

      // Add importing user as ORGANIZER
      await tx.eventRole.upsert({
        where: {
          userId_eventId_role: {
            userId: req.user!.id,
            eventId,
            role: "ORGANIZER",
          },
        },
        create: {
          userId: req.user!.id,
          eventId,
          role: "ORGANIZER",
        },
        update: {},
      });

      // B. Create Users
      const userMapByEmail = new Map<string, string>();
      const existingUsersAll = await tx.user.findMany({
        where: { email: { in: Array.from(allEmails) } },
        select: { id: true, email: true },
      });
      for (const u of existingUsersAll) {
        userMapByEmail.set(u.email.toLowerCase(), u.id);
      }

      for (const uToCreate of usersToCreate) {
        if (!userMapByEmail.has(uToCreate.email)) {
          const created = await tx.user.create({
            data: {
              email: uToCreate.email,
              name: uToCreate.name,
              passwordHash: defaultPasswordHash,
              platformRole: "USER",
            },
          });
          userMapByEmail.set(created.email.toLowerCase(), created.id);
        }
      }

    // C. Create Tracks
    const trackMapByName = new Map<string, string>();
    const currentTracks = await tx.track.findMany({ where: { eventId } });
    for (const tr of currentTracks) {
      trackMapByName.set(tr.name.toLowerCase(), tr.id);
      trackMapByName.set(tr.id, tr.id);
    }

    for (const trData of data.tracks) {
      let trId =
        trackMapByName.get(trData.name.toLowerCase()) ??
        (trData.id ? trackMapByName.get(trData.id) : undefined);

      if (!trId) {
        const created = await tx.track.create({
          data: {
            ...(trData.id ? { id: trData.id } : {}),
            eventId,
            name: trData.name,
            description: trData.description ?? "",
          },
        });
        trId = created.id;
        trackMapByName.set(created.name.toLowerCase(), created.id);
      }

      if (trData.id) {
        trackMapByName.set(trData.id, trId);
        trackMapByName.set(trData.id.toLowerCase(), trId);
      }
    }

    // D. Create Prizes & Criteria
    for (const pData of data.prizes) {
      await tx.prize.create({
        data: {
          ...(pData.id ? { id: pData.id } : {}),
          eventId,
          name: pData.name,
          description: pData.description ?? "",
          value: pData.value ?? "",
          place: pData.place ?? null,
        },
      });
    }

    for (const cData of data.criteria) {
      await tx.criterion.upsert({
        where: { eventId_key: { eventId, key: cData.key } },
        create: {
          ...(cData.id ? { id: cData.id } : {}),
          eventId,
          key: cData.key,
          name: cData.name,
          description: cData.description ?? "",
          weight: cData.weight,
          minScore: cData.minScore ?? 1,
          maxScore: cData.maxScore ?? 5,
          position: cData.position ?? 0,
        },
        update: {},
      });
    }

    // E. Create Judges & Event Roles
    for (const jData of data.judges) {
      const uId = userMapByEmail.get(jData.email.toLowerCase());
      if (uId) {
        if (jData.id) {
          userMapByEmail.set(jData.id, uId);
          userMapByEmail.set(jData.id.toLowerCase(), uId);
        }
        await tx.eventRole.upsert({
          where: { userId_eventId_role: { userId: uId, eventId, role: "JUDGE" } },
          create: { userId: uId, eventId, role: "JUDGE" },
          update: {},
        });

        for (const tRef of jData.tracks) {
          const trId =
            trackMapByName.get(tRef) ??
            trackMapByName.get(tRef.toLowerCase()) ??
            tRef;
          if (trId) {
            await tx.judgeTrack.upsert({
              where: { userId_trackId: { userId: uId, trackId: trId } },
              create: { userId: uId, eventId, trackId: trId },
              update: {},
            });
          }
        }
      }
    }

    // F. Create Teams & Members
    const teamMapByName = new Map<string, string>();
    const currentTeams = await tx.team.findMany({ where: { eventId } });
    for (const tm of currentTeams) {
      teamMapByName.set(tm.name.toLowerCase(), tm.id);
      teamMapByName.set(tm.id, tm.id);
    }

    for (const tmData of data.teams) {
      let teamId =
        teamMapByName.get(tmData.name.toLowerCase()) ??
        (tmData.id ? teamMapByName.get(tmData.id) : undefined);

      if (!teamId) {
        const inviteCode = tmData.inviteCode ?? `inv_${crypto.randomBytes(4).toString("hex")}`;
        const created = await tx.team.create({
          data: {
            ...(tmData.id ? { id: tmData.id } : {}),
            eventId,
            name: tmData.name,
            inviteCode,
          },
        });
        teamId = created.id;
        teamMapByName.set(created.name.toLowerCase(), created.id);
      }

      if (tmData.id) {
        teamMapByName.set(tmData.id, teamId);
        teamMapByName.set(tmData.id.toLowerCase(), teamId);
      }

      for (const mEmail of tmData.members) {
        const uId = userMapByEmail.get(mEmail.toLowerCase());
        if (uId) {
          await tx.eventRole.upsert({
            where: { userId_eventId_role: { userId: uId, eventId, role: "PARTICIPANT" } },
            create: { userId: uId, eventId, role: "PARTICIPANT" },
            update: {},
          });
          await tx.teamMember.upsert({
            where: { eventId_userId: { eventId, userId: uId } },
            create: { teamId, userId: uId, eventId },
            update: {},
          });
        }
      }
    }

    // G. Create Projects
    const projectMapByTitle = new Map<string, string>();
    const currentProjects = await tx.project.findMany({ where: { eventId } });
    for (const pr of currentProjects) {
      projectMapByTitle.set(pr.title.toLowerCase(), pr.id);
      projectMapByTitle.set(pr.id, pr.id);
    }

    for (const pData of data.projects) {
      let projectId =
        projectMapByTitle.get(pData.title.toLowerCase()) ??
        (pData.id ? projectMapByTitle.get(pData.id) : undefined);

      if (!projectId) {
        const teamRef = pData.teamId ?? pData.team ?? "";
        const teamId =
          teamMapByName.get(teamRef) ??
          teamMapByName.get(teamRef.toLowerCase()) ??
          teamRef;

        const trackRef = pData.trackId ?? pData.track ?? null;
        const trackId = trackRef
          ? (trackMapByName.get(trackRef) ??
              trackMapByName.get(trackRef.toLowerCase()) ??
              trackRef)
          : null;

        if (teamId) {
          const subAt = pData.submittedAt
            ? new Date(pData.submittedAt)
            : pData.submitted_at
              ? new Date(pData.submitted_at)
              : clock.now();

          const created = await tx.project.create({
            data: {
              ...(pData.id ? { id: pData.id } : {}),
              eventId,
              teamId,
              trackId,
              title: pData.title,
              summary: pData.summary ?? "",
              repoUrl: pData.repoUrl ?? pData.repo_url ?? "",
              demoUrl: pData.demoUrl ?? pData.demo_url ?? "",
              status: pData.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT",
              submittedAt: subAt,
            },
          });
          projectId = created.id;
          projectMapByTitle.set(created.title.toLowerCase(), created.id);
        }
      }

      if (projectId && pData.id) {
        projectMapByTitle.set(pData.id, projectId);
        projectMapByTitle.set(pData.id.toLowerCase(), projectId);
      }
    }

    // H. Create Scores / Assignments
    const criteriaByEvent = await tx.criterion.findMany({ where: { eventId } });
    const criterionMapByKey = new Map<string, string>();
    for (const c of criteriaByEvent) criterionMapByKey.set(c.key, c.id);

    for (const sData of data.scores) {
      const judgeRef = sData.judgeId ?? sData.judge ?? "";
      const judgeId =
        userMapByEmail.get(judgeRef) ??
        userMapByEmail.get(judgeRef.toLowerCase()) ??
        judgeRef;

      const projectRef = sData.projectId ?? sData.project ?? "";
      const projectId =
        projectMapByTitle.get(projectRef) ??
        projectMapByTitle.get(projectRef.toLowerCase()) ??
        projectRef;

      if (judgeId && projectId) {
        const assignment = await tx.assignment.upsert({
          where: { judgeId_projectId: { judgeId, projectId } },
          create: {
            eventId,
            judgeId,
            projectId,
            status: "SUBMITTED",
            comment: sData.comment ?? "",
            submittedAt: clock.now(),
          },
          update: {
            status: "SUBMITTED",
            comment: sData.comment ?? "",
            submittedAt: clock.now(),
          },
        });

        const criteriaEntries = sData.criteria
          ? Object.entries(sData.criteria)
          : (sData.scores ?? []).map((sc) => [sc.criterionKey, sc.value] as const);

        for (const [cKey, val] of criteriaEntries) {
          const cId = criterionMapByKey.get(cKey);
          if (cId) {
            await tx.criterionScore.upsert({
              where: {
                assignmentId_criterionId: {
                  assignmentId: assignment.id,
                  criterionId: cId,
                },
              },
              create: {
                assignmentId: assignment.id,
                criterionId: cId,
                value: val as number,
              },
              update: {
                value: val as number,
              },
            });
          }
        }
      }
    }
  }, { timeout: 30000 });

  await audit(req, "import.json", { type: "event", id: eventId, eventId });

  return {
    dryRun: false,
    summary,
    skipped,
    errors: [],
  };
}

export async function importJudgesCsv(
  req: Request,
  eventId: string,
  csvContent: string,
  dryRun: boolean,
) {
  if (!req.user) throw unauthorized();

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) throw notFound("Event not found");

  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const firstLine = lines[0];
  if (!firstLine || lines.length < 2) {
    throw badRequest("CSV file must contain a header and at least one data row");
  }

  const header = firstLine.toLowerCase().split(",").map((h) => h.trim());
  const emailIdx = header.indexOf("email");
  const nameIdx = header.indexOf("name");
  const tracksIdx = header.indexOf("tracks");

  if (emailIdx === -1 || nameIdx === -1) {
    throw badRequest("CSV header must contain 'email' and 'name' columns");
  }

  const tracks = await prisma.track.findMany({ where: { eventId } });
  const trackMap = new Map<string, string>();
  for (const t of tracks) {
    trackMap.set(t.name.toLowerCase(), t.id);
    trackMap.set(t.id, t.id);
  }

  const parseErrors: Array<{ row: number; error: string }> = [];
  const invitesToCreate: Array<{ email: string; name: string; trackIds: string[] }> = [];

  for (let i = 1; i < lines.length; i++) {
    const lineStr = lines[i];
    if (!lineStr) continue;
    const cols = lineStr.split(",").map((c) => c.trim().replace(/^['"]|['"]$/g, ""));
    const email = cols[emailIdx]?.toLowerCase();
    const name = cols[nameIdx];
    const rawTracks = tracksIdx !== -1 ? cols[tracksIdx] : "";

    if (!email || !email.includes("@")) {
      parseErrors.push({ row: i + 1, error: `Invalid email address on row ${i + 1}` });
      continue;
    }

    if (!name) {
      parseErrors.push({ row: i + 1, error: `Missing name on row ${i + 1}` });
      continue;
    }

    const trackList = rawTracks
      ? rawTracks
          .split(/[|;]/)
          .map((t) => t.trim().toLowerCase())
          .map((t) => trackMap.get(t))
          .filter((t): t is string => Boolean(t))
      : [];

    invitesToCreate.push({ email, name, trackIds: trackList });
  }

  if (dryRun) {
    return {
      dryRun: true,
      summary: { invitesToCreate: invitesToCreate.length },
      errors: parseErrors,
    };
  }

  let createdCount = 0;
  for (const inv of invitesToCreate) {
    const token = generateToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(clock.now().getTime() + 7 * 24 * 60 * 60 * 1000);

    await prisma.judgeInvite.create({
      data: {
        eventId,
        email: inv.email,
        trackIds: inv.trackIds,
        tokenHash,
        createdById: req.user.id,
        expiresAt,
      },
    });
    createdCount++;
  }

  await audit(req, "import.judges_csv", { type: "event", id: eventId, eventId }, { count: createdCount });

  return {
    dryRun: false,
    summary: { invitesCreated: createdCount },
    errors: parseErrors,
  };
}
