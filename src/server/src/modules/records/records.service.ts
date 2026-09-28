import type { Request } from "express";
import crypto from "node:crypto";
import type { VerifyRecordBody } from "@dogfood/shared";
import { config } from "../../config.js";
import { audit } from "../../lib/audit.js";
import { clock } from "../../lib/clock.js";
import { notFound, forbidden } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import {
  canonicalize,
  decryptPrivateKey,
  encryptPrivateKey,
  generateEd25519KeyPair,
  hashPayload,
  signCanonicalPayload,
  verifyCanonicalPayload,
} from "./crypto.js";
import { emitWebhookEvent } from "../webhooks/webhooks.service.js";

export async function getActiveSigningKey() {
  const existing = await prisma.signingKey.findFirst({
    where: { retiredAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return existing;
  }

  const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();
  const encryptedPrivateKey = encryptPrivateKey(
    privateKeyPem,
    config.SIGNING_KEY_SECRET,
  );

  return prisma.signingKey.create({
    data: {
      publicKey: publicKeyPem,
      privateKey: encryptedPrivateKey,
      createdAt: clock.now(),
    },
  });
}

export async function rotateSigningKey() {
  const active = await prisma.signingKey.findFirst({
    where: { retiredAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (active) {
    await prisma.signingKey.update({
      where: { id: active.id },
      data: { retiredAt: clock.now() },
    });
  }

  return getActiveSigningKey();
}

export async function issueJudgeParticipationRecords(
  eventId: string,
  req?: Request,
) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    throw notFound("Event not found");
  }

  const assignments = await prisma.assignment.findMany({
    where: { eventId, status: "SUBMITTED" },
    include: {
      judge: { select: { id: true, name: true } },
    },
    orderBy: { submittedAt: "asc" },
  });

  const assignmentsByJudge = new Map<
    string,
    { judgeName: string; assignments: typeof assignments }
  >();
  for (const a of assignments) {
    const existing = assignmentsByJudge.get(a.judgeId) ?? {
      judgeName: a.judge.name,
      assignments: [],
    };
    existing.assignments.push(a);
    assignmentsByJudge.set(a.judgeId, existing);
  }

  const activeKey = await getActiveSigningKey();
  const decryptedPrivateKey = decryptPrivateKey(
    activeKey.privateKey,
    config.SIGNING_KEY_SECRET,
  );

  const createdRecords = [];

  for (const [judgeId, data] of assignmentsByJudge.entries()) {
    if (data.assignments.length === 0) continue;

    const existingRecord = await prisma.record.findFirst({
      where: {
        eventId,
        subjectUserId: judgeId,
        type: "judge_participation",
      },
    });

    if (existingRecord) {
      createdRecords.push(existingRecord);
      continue;
    }

    const firstAssignment = data.assignments[0];
    const lastAssignment = data.assignments[data.assignments.length - 1];

    const firstReviewAt = firstAssignment?.submittedAt ?? clock.now();
    const lastReviewAt = lastAssignment?.submittedAt ?? clock.now();

    const recordId = `rec_${crypto.randomBytes(12).toString("hex")}`;
    const issuedAt = clock.now();

    const payload = {
      id: recordId,
      type: "judge_participation",
      eventId,
      eventName: event.name,
      judgeDisplayName: data.judgeName,
      reviewsSubmitted: data.assignments.length,
      firstReviewAt: firstReviewAt.toISOString(),
      lastReviewAt: lastReviewAt.toISOString(),
      issuer: `DOGFOOD portal at ${config.PUBLIC_URL}`,
      issuedAt: issuedAt.toISOString(),
    };

    const canonicalJson = canonicalize(payload);
    const payloadHash = hashPayload(canonicalJson);
    const signature = signCanonicalPayload(canonicalJson, decryptedPrivateKey);

    const record = await prisma.record.create({
      data: {
        id: recordId,
        type: "judge_participation",
        eventId,
        subjectUserId: judgeId,
        payload,
        payloadHash,
        signature,
        kid: activeKey.id,
        issuedAt,
      },
    });

    if (req) {
      await audit(
        req,
        "record.issue",
        { type: "record", id: recordId, eventId },
        { subjectUserId: judgeId, type: "judge_participation" },
      );
    }

    emitWebhookEvent(eventId, "record.issued", {
      recordId,
      type: "judge_participation",
      subjectUserId: judgeId,
    }).catch(() => {});
    createdRecords.push(record);
  }

  return createdRecords;
}

export async function revokeRecord(
  req: Request,
  recordId: string,
  reason: string,
) {
  const record = await prisma.record.findUnique({ where: { id: recordId } });
  if (!record) {
    throw notFound("Record not found");
  }

  const updated = await prisma.record.update({
    where: { id: recordId },
    data: {
      revokedAt: clock.now(),
      revokedReason: reason,
    },
  });

  await audit(
    req,
    "record.revoke",
    { type: "record", id: recordId, eventId: record.eventId },
    { reason },
  );

  return updated;
}

export async function getRecordPublic(recordId: string) {
  const record = await prisma.record.findUnique({
    where: { id: recordId },
    include: {
      signingKey: { select: { publicKey: true } },
    },
  });

  if (!record) {
    throw notFound("Record not found");
  }

  const canonicalJson = canonicalize(record.payload);
  const hashMatches = hashPayload(canonicalJson) === record.payloadHash;
  const signatureValid = verifyCanonicalPayload(
    canonicalJson,
    record.signature,
    record.signingKey.publicKey,
  );

  const isValid = hashMatches && signatureValid && !record.revokedAt;

  return {
    record: {
      id: record.id,
      type: record.type,
      eventId: record.eventId,
      subjectUserId: record.subjectUserId,
      payload: record.payload,
      payloadHash: record.payloadHash,
      signature: record.signature,
      kid: record.kid,
      issuedAt: record.issuedAt.toISOString(),
      revokedAt: record.revokedAt?.toISOString() ?? null,
      revokedReason: record.revokedReason,
    },
    valid: isValid,
  };
}

export async function getPublicSigningKeys() {
  const keys = await prisma.signingKey.findMany({
    orderBy: { createdAt: "desc" },
  });

  return {
    keys: keys.map((k) => ({
      kid: k.id,
      publicKey: k.publicKey,
      createdAt: k.createdAt.toISOString(),
      retiredAt: k.retiredAt?.toISOString() ?? null,
    })),
  };
}

export async function verifyRecordPayload(body: VerifyRecordBody) {
  const signingKey = await prisma.signingKey.findUnique({
    where: { id: body.kid },
  });

  if (!signingKey) {
    return { valid: false, reason: "Unknown key ID (kid)" };
  }

  const canonicalJson = canonicalize(body.payload);
  const signatureValid = verifyCanonicalPayload(
    canonicalJson,
    body.signature,
    signingKey.publicKey,
  );

  if (!signatureValid) {
    return { valid: false, reason: "Signature verification failed" };
  }

  const payloadHash = hashPayload(canonicalJson);

  const matchingRecord = await prisma.record.findFirst({
    where: {
      kid: body.kid,
      payloadHash,
    },
  });

  if (!matchingRecord) {
    return { valid: false, reason: "unknown_record" };
  }

  if (matchingRecord.revokedAt) {
    return {
      valid: false,
      revoked: true,
      reason: matchingRecord.revokedReason ?? "Record has been revoked",
    };
  }

  return { valid: true };
}

export async function getUserRecords(userId: string) {
  const records = await prisma.record.findMany({
    where: { subjectUserId: userId },
    orderBy: { issuedAt: "desc" },
  });

  return records.map((r) => ({
    id: r.id,
    type: r.type,
    eventId: r.eventId,
    subjectUserId: r.subjectUserId,
    payload: r.payload,
    payloadHash: r.payloadHash,
    signature: r.signature,
    kid: r.kid,
    issuedAt: r.issuedAt.toISOString(),
    revokedAt: r.revokedAt?.toISOString() ?? null,
    revokedReason: r.revokedReason,
  }));
}

export async function getUserCertificates(userId: string) {
  const records = await prisma.record.findMany({
    where: {
      subjectUserId: userId,
      type: { in: ["participant_certificate", "judge_certificate"] },
    },
    orderBy: { issuedAt: "desc" },
  });

  return records.map((r) => ({
    id: r.id,
    type: r.type,
    eventId: r.eventId,
    subjectUserId: r.subjectUserId,
    payload: r.payload,
    payloadHash: r.payloadHash,
    signature: r.signature,
    kid: r.kid,
    issuedAt: r.issuedAt.toISOString(),
    revokedAt: r.revokedAt?.toISOString() ?? null,
    revokedReason: r.revokedReason,
  }));
}

export async function getEventCertificates(eventId: string) {
  const records = await prisma.record.findMany({
    where: {
      eventId,
      type: { in: ["participant_certificate", "judge_certificate"] },
    },
    orderBy: { issuedAt: "desc" },
  });

  return records.map((r) => ({
    id: r.id,
    type: r.type,
    eventId: r.eventId,
    subjectUserId: r.subjectUserId,
    payload: r.payload,
    payloadHash: r.payloadHash,
    signature: r.signature,
    kid: r.kid,
    issuedAt: r.issuedAt.toISOString(),
    revokedAt: r.revokedAt?.toISOString() ?? null,
    revokedReason: r.revokedReason,
  }));
}

export async function issueCertificates(eventId: string, req?: Request) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    throw notFound("Event not found");
  }
  if (!event.resultsPublishedAt) {
    throw forbidden(
      "results_not_published",
      "Certificates can only be issued after results are published",
    );
  }

  const projects = await prisma.project.findMany({
    where: { eventId, status: "SUBMITTED", duplicateOfId: null },
    include: {
      team: {
        include: {
          members: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
      },
      track: { select: { id: true, name: true } },
    },
  });

  const normalizedProjectsMap = new Map<string, number>();
  if (event.resultsPublishedAt) {
    const { loadEventNormData } = await import("../judging/service.js");
    const { normalizeScores } = await import("../judging/normalization.js");
    const { buildNormalizationInput } = await import("../judging/results.js");

    const normData = await loadEventNormData(eventId);
    const normalized = normalizeScores(
      buildNormalizationInput({
        criteria: normData.criteria,
        assignments: normData.assignments,
        projects: normData.projects,
        reviewsPerProject: normData.event.reviewsPerProject,
      }),
    );
    for (const p of normalized.projects) {
      if (p.rank !== null) {
        normalizedProjectsMap.set(p.id, p.rank);
      }
    }
  }

  const activeKey = await getActiveSigningKey();
  const decryptedPrivateKey = decryptPrivateKey(
    activeKey.privateKey,
    config.SIGNING_KEY_SECRET,
  );

  const issuedRecords = [];

  // 1. Participant certificates
  for (const project of projects) {
    const rank = normalizedProjectsMap.get(project.id);
    let placement: string | null = null;
    if (event.resultsPublishedAt) {
      if (rank === 1) placement = `1st place${project.track ? ` — ${project.track.name}` : ""}`;
      else if (rank === 2) placement = `2nd place${project.track ? ` — ${project.track.name}` : ""}`;
      else if (rank === 3) placement = `3rd place${project.track ? ` — ${project.track.name}` : ""}`;
      else placement = "Participant";
    }

    for (const member of project.team.members) {
      const subjectUserId = member.user.id;
      const existing = await prisma.record.findFirst({
        where: { eventId, subjectUserId, type: "participant_certificate" },
      });
      if (existing) {
        issuedRecords.push(existing);
        continue;
      }

      const recordId = `rec_${crypto.randomBytes(12).toString("hex")}`;
      const issuedAt = clock.now();
      const payload = {
        id: recordId,
        type: "participant_certificate",
        eventId,
        eventName: event.name,
        participantId: subjectUserId,
        participantName: member.user.name,
        teamId: project.team.id,
        teamName: project.team.name,
        projectId: project.id,
        projectTitle: project.title,
        trackId: project.trackId,
        trackName: project.track?.name ?? null,
        placement,
        issuer: `DOGFOOD portal at ${config.PUBLIC_URL}`,
        issuedAt: issuedAt.toISOString(),
      };

      const canonicalJson = canonicalize(payload);
      const payloadHash = hashPayload(canonicalJson);
      const signature = signCanonicalPayload(canonicalJson, decryptedPrivateKey);

      const record = await prisma.record.create({
        data: {
          id: recordId,
          type: "participant_certificate",
          eventId,
          subjectUserId,
          payload,
          payloadHash,
          signature,
          kid: activeKey.id,
          issuedAt,
        },
      });

      if (req) {
        await audit(
          req,
          "record.issue",
          { type: "record", id: recordId, eventId },
          { subjectUserId, type: "participant_certificate" },
        );
      }
      emitWebhookEvent(eventId, "record.issued", {
        recordId,
        type: "participant_certificate",
        subjectUserId,
      }).catch(() => {});
      issuedRecords.push(record);
    }
  }

  // 2. Judge certificates
  const assignments = await prisma.assignment.findMany({
    where: { eventId, status: "SUBMITTED" },
    include: { judge: { select: { id: true, name: true } } },
  });

  const judgeReviewCounts = new Map<string, { judgeName: string; count: number }>();
  for (const a of assignments) {
    const cur = judgeReviewCounts.get(a.judgeId) ?? { judgeName: a.judge.name, count: 0 };
    cur.count += 1;
    judgeReviewCounts.set(a.judgeId, cur);
  }

  for (const [judgeId, data] of judgeReviewCounts.entries()) {
    if (data.count === 0) continue;

    const existing = await prisma.record.findFirst({
      where: { eventId, subjectUserId: judgeId, type: "judge_certificate" },
    });
    if (existing) {
      issuedRecords.push(existing);
      continue;
    }

    const recordId = `rec_${crypto.randomBytes(12).toString("hex")}`;
    const issuedAt = clock.now();
    const payload = {
      id: recordId,
      type: "judge_certificate",
      eventId,
      eventName: event.name,
      judgeId,
      judgeName: data.judgeName,
      reviewsCount: data.count,
      issuer: `DOGFOOD portal at ${config.PUBLIC_URL}`,
      issuedAt: issuedAt.toISOString(),
    };

    const canonicalJson = canonicalize(payload);
    const payloadHash = hashPayload(canonicalJson);
    const signature = signCanonicalPayload(canonicalJson, decryptedPrivateKey);

    const record = await prisma.record.create({
      data: {
        id: recordId,
        type: "judge_certificate",
        eventId,
        subjectUserId: judgeId,
        payload,
        payloadHash,
        signature,
        kid: activeKey.id,
        issuedAt,
      },
    });

    if (req) {
      await audit(
        req,
        "record.issue",
        { type: "record", id: recordId, eventId },
        { subjectUserId: judgeId, type: "judge_certificate" },
      );
    }
    emitWebhookEvent(eventId, "record.issued", {
      recordId,
      type: "judge_certificate",
      subjectUserId: judgeId,
    }).catch(() => {});
    issuedRecords.push(record);
  }

  return issuedRecords;
}
