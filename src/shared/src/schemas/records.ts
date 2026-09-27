import { z } from "zod";

export const revokeRecordSchema = z.object({
  reason: z.string().min(1, "Revocation reason is required"),
});

export const verifyRecordSchema = z.object({
  payload: z.unknown(),
  signature: z.string().min(1, "Signature is required"),
  kid: z.string().min(1, "Key ID (kid) is required"),
});

export const issueRecordSchema = z.object({
  subjectUserId: z.string().min(1, "subjectUserId is required"),
  type: z
    .enum(["judge_participation", "participant_certificate", "judge_certificate"])
    .default("judge_participation"),
});

export type RevokeRecordBody = z.infer<typeof revokeRecordSchema>;
export type VerifyRecordBody = z.infer<typeof verifyRecordSchema>;
export type IssueRecordBody = z.infer<typeof issueRecordSchema>;
