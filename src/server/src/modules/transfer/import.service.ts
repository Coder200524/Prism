import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request } from "express";
import { importEventSchema, type ImportEventInput } from "@dogfood/shared";
import { audit } from "../../lib/audit.js";
import { assertApiKeyEventScope } from "../../lib/api-key-scope.js";
import { clock } from "../../lib/clock.js";
import { badRequest, notFound, unauthorized } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { generateToken, hashToken } from "../../lib/tokens.js";
import { parseCsv } from "../../lib/csv.js";

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

  // Event-scoped API keys may only import into their own event.
  assertApiKeyEventScope(req, eventId);

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

    // D. Create Prizes & Criteria (prizes: create-if-missing only)
    const existingPrizes = await tx.prize.findMany({ where: { eventId } });
    const prizeById = new Map(existingPrizes.map((p) => [p.id, p]));
    const prizeIdentityKey = (
      name: string,
      place: number | null | undefined,
      trackId: string | null | undefined,
    ) => `${name.toLowerCase()}|${place ?? ""}|${trackId ?? ""}`;
    const prizeByIdentity = new Map(
      existingPrizes.map((p) => [prizeIdentityKey(p.name, p.place, p.trackId), p]),
    );

    for (const pData of data.prizes) {
      let prizeTrackId: string | null = null;
      if (pData.trackId) {
        prizeTrackId =
          trackMapByName.get(pData.trackId) ??
          trackMapByName.get(pData.trackId.toLowerCase()) ??
          null;
        if (!prizeTrackId) {
          const trackRow = await tx.track.findUnique({
            where: { id: pData.trackId },
            select: { id: true, eventId: true },
          });
          if (trackRow && trackRow.eventId !== eventId) {
            throw badRequest(
              `Import rejected: track "${pData.trackId}" does not belong to event ${eventId}`,
            );
          }
          prizeTrackId = trackRow?.eventId === eventId ? trackRow.id : null;
        }
      }

      if (pData.id) {
        const byId = prizeById.get(pData.id);
        if (byId) {
          continue;
        }
        const conflicting = await tx.prize.findUnique({
          where: { id: pData.id },
          select: { id: true, eventId: true },
        });
        if (conflicting && conflicting.eventId !== eventId) {
          throw badRequest(
            `Import rejected: prize id "${pData.id}" already belongs to another event`,
          );
        }
      }

      const identity = prizeIdentityKey(pData.name, pData.place ?? null, prizeTrackId);
      if (prizeByIdentity.has(identity)) {
        continue;
      }

      const created = await tx.prize.create({
        data: {
          ...(pData.id ? { id: pData.id } : {}),
          eventId,
          trackId: prizeTrackId,
          name: pData.name,
          description: pData.description ?? "",
          value: pData.value ?? "",
          place: pData.place ?? null,
        },
      });
      prizeById.set(created.id, created);
      prizeByIdentity.set(identity, created);
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
          let trId =
            trackMapByName.get(tRef) ?? trackMapByName.get(tRef.toLowerCase());
          if (!trId) {
            const trackRow = await tx.track.findUnique({
              where: { id: tRef },
              select: { id: true, eventId: true },
            });
            if (trackRow && trackRow.eventId !== eventId) {
              throw badRequest(
                `Import rejected: track "${tRef}" does not belong to event ${eventId}`,
              );
            }
            trId = trackRow?.eventId === eventId ? trackRow.id : undefined;
          }
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
        if (tmData.id) {
          const conflicting = await tx.team.findUnique({
            where: { id: tmData.id },
            select: { id: true, eventId: true },
          });
          if (conflicting && conflicting.eventId !== eventId) {
            throw badRequest(
              `Import rejected: team id "${tmData.id}" already belongs to another event`,
            );
          }
        }
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
        let teamId =
          teamMapByName.get(teamRef) ?? teamMapByName.get(teamRef.toLowerCase());
        if (!teamId && teamRef) {
          const teamRow = await tx.team.findUnique({
            where: { id: teamRef },
            select: { id: true, eventId: true },
          });
          if (teamRow && teamRow.eventId !== eventId) {
            throw badRequest(
              `Import rejected: team "${teamRef}" does not belong to event ${eventId}`,
            );
          }
          teamId = teamRow?.eventId === eventId ? teamRow.id : undefined;
        }

        const trackRef = pData.trackId ?? pData.track ?? null;
        let trackId: string | null = null;
        if (trackRef) {
          trackId =
            trackMapByName.get(trackRef) ??
            trackMapByName.get(trackRef.toLowerCase()) ??
            null;
          if (!trackId) {
            const trackRow = await tx.track.findUnique({
              where: { id: trackRef },
              select: { id: true, eventId: true },
            });
            if (trackRow && trackRow.eventId !== eventId) {
              throw badRequest(
                `Import rejected: track "${trackRef}" does not belong to event ${eventId}`,
              );
            }
            trackId = trackRow?.eventId === eventId ? trackRow.id : null;
          }
        }

        if (teamId) {
          const subAt = pData.submittedAt
            ? new Date(pData.submittedAt)
            : pData.submitted_at
              ? new Date(pData.submitted_at)
              : clock.now();

          if (pData.id) {
            const conflicting = await tx.project.findUnique({
              where: { id: pData.id },
              select: { id: true, eventId: true },
            });
            if (conflicting && conflicting.eventId !== eventId) {
              throw badRequest(
                `Import rejected: project id "${pData.id}" already belongs to another event`,
              );
            }
          }

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

    // H. Create Scores / Assignments — create-only; never overwrite existing judging.
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

      if (!judgeId || !projectId) continue;

      const projectRow = await tx.project.findUnique({
        where: { id: projectId },
        select: { id: true, eventId: true },
      });
      if (!projectRow || projectRow.eventId !== eventId) {
        throw badRequest(
          `Import rejected: project "${projectRef}" does not belong to event ${eventId}`,
        );
      }

      const judgeRole = await tx.eventRole.findFirst({
        where: { eventId, userId: judgeId, role: "JUDGE" },
        select: { userId: true },
      });
      if (!judgeRole) {
        throw badRequest(
          `Import rejected: judge "${judgeRef}" is not a judge of event ${eventId}`,
        );
      }

      const existingAssignment = await tx.assignment.findUnique({
        where: { judgeId_projectId: { judgeId, projectId } },
        select: { id: true },
      });
      if (existingAssignment) {
        // Preserve organizer/judge decisions — do not mutate scores or status.
        continue;
      }

      const assignment = await tx.assignment.create({
        data: {
          eventId,
          judgeId,
          projectId,
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
        if (!cId) continue;
        await tx.criterionScore.create({
          data: {
            assignmentId: assignment.id,
            criterionId: cId,
            value: val as number,
          },
        });
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

  const rows = parseCsv(csvContent);
  const headerRow = rows[0];
  if (!headerRow || rows.length < 2) {
    throw badRequest("CSV file must contain a header and at least one data row");
  }

  const header = headerRow.map((h) => h.trim().toLowerCase());
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
  const seenEmails = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols) continue;
    const email = cols[emailIdx]?.trim().toLowerCase();
    const name = cols[nameIdx]?.trim();
    const rawTracks = tracksIdx !== -1 ? (cols[tracksIdx] ?? "") : "";

    if (!email || !email.includes("@")) {
      parseErrors.push({ row: i + 1, error: `Invalid email address on row ${i + 1}` });
      continue;
    }

    if (!name) {
      parseErrors.push({ row: i + 1, error: `Missing name on row ${i + 1}` });
      continue;
    }

    if (seenEmails.has(email)) {
      continue;
    }
    seenEmails.add(email);

    const trackList = rawTracks
      ? rawTracks
          .split(/[|;]/)
          .map((t) => t.trim().toLowerCase())
          .map((t) => trackMap.get(t))
          .filter((t): t is string => Boolean(t))
      : [];

    invitesToCreate.push({ email, name, trackIds: trackList });
  }

  // Skip emails that already have a judge role or a pending invite for this event.
  const existingJudges = await prisma.eventRole.findMany({
    where: { eventId, role: "JUDGE" },
    include: { user: { select: { email: true } } },
  });
  const existingJudgeEmails = new Set(
    existingJudges.map((row) => row.user.email.toLowerCase()),
  );
  const existingInvites = await prisma.judgeInvite.findMany({
    where: { eventId, acceptedAt: null, expiresAt: { gt: clock.now() } },
    select: { email: true },
  });
  const existingInviteEmails = new Set(
    existingInvites.map((row) => row.email.toLowerCase()),
  );

  const filtered = invitesToCreate.filter(
    (inv) =>
      !existingJudgeEmails.has(inv.email) && !existingInviteEmails.has(inv.email),
  );

  if (dryRun) {
    return {
      dryRun: true,
      summary: {
        invitesToCreate: filtered.length,
        skippedExisting: invitesToCreate.length - filtered.length,
      },
      errors: parseErrors,
    };
  }

  let createdCount = 0;
  for (const inv of filtered) {
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

  await audit(req, "import.judges_csv", { type: "event", id: eventId, eventId }, {
    count: createdCount,
  });

  return {
    dryRun: false,
    summary: {
      invitesCreated: createdCount,
      skippedExisting: invitesToCreate.length - createdCount,
    },
    errors: parseErrors,
  };
}
