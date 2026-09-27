import type { Request } from "express";
import crypto from "node:crypto";
import type { VerifyRecordBody } from "@dogfood/shared";
import { config } from "../../config.js";
import { audit } from "../../lib/audit.js";
import { clock } from "../../lib/clock.js";
import { notFound } from "../../lib/http-error.js";
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

  const matchingRecord = await prisma.record.findFirst({
    where: {
      kid: body.kid,
      signature: body.signature,
    },
  });

  if (matchingRecord?.revokedAt) {
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
