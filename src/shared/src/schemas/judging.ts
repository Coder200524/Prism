import { z } from "zod";

export const criterionInputSchema = z.object({
  key: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional().default(""),
  weight: z.number().int().positive(),
  minScore: z.number().int(),
  maxScore: z.number().int(),
});

export const putCriteriaBodySchema = z.object({
  criteria: z.array(criterionInputSchema).min(1),
});

export const judgeInviteBodySchema = z.object({
  email: z.string().email(),
  trackIds: z.array(z.string()).default([]),
});

export const judgeTracksBodySchema = z.object({
  trackIds: z.array(z.string()),
});

export const manualAssignmentBodySchema = z.object({
  judgeId: z.string().min(1),
  projectId: z.string().min(1),
});

export const scoreUpdateBodySchema = z.object({
  scores: z.record(z.number().int()),
  comment: z.string().max(5000).optional(),
  submit: z.boolean().optional().default(false),
});

export const judgeScoresQuerySchema = z.object({
  judge: z.string().optional(),
  eventId: z.string().optional(),
});

export const exportQuerySchema = z.object({
  type: z.enum(["results", "scores"]).optional().default("results"),
});

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export type PutCriteriaBody = z.infer<typeof putCriteriaBodySchema>;
export type JudgeInviteBody = z.infer<typeof judgeInviteBodySchema>;
export type JudgeTracksBody = z.infer<typeof judgeTracksBodySchema>;
export type ManualAssignmentBody = z.infer<typeof manualAssignmentBodySchema>;
export type ScoreUpdateBody = z.infer<typeof scoreUpdateBodySchema>;
