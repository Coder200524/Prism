import { z } from "zod";

const isoDateTime = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Invalid datetime" });

export const trackInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional().default(""),
});

export const prizeInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional().default(""),
  value: z.string().max(120).optional().default(""),
  place: z.number().int().positive().nullable().optional(),
  trackId: z.string().nullable().optional(),
});

export const createEventBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).optional().default(""),
  submissionsOpen: isoDateTime,
  submissionsClose: isoDateTime,
  judgingClose: isoDateTime.nullable().optional(),
  votingOpen: isoDateTime.nullable().optional(),
  votingClose: isoDateTime.nullable().optional(),
  maxTeamSize: z.number().int().min(1).max(50).optional().default(4),
  reviewsPerProject: z.number().int().min(1).max(20).optional().default(3),
  tracks: z.array(trackInputSchema).default([]),
  prizes: z.array(prizeInputSchema).default([]),
});

export const patchEventBodySchema = createEventBodySchema.partial();

export const createTrackBodySchema = trackInputSchema;
export const patchTrackBodySchema = trackInputSchema.partial();
export const createPrizeBodySchema = prizeInputSchema;
export const patchPrizeBodySchema = prizeInputSchema.partial();

export type CreateEventBody = z.infer<typeof createEventBodySchema>;
export type PatchEventBody = z.infer<typeof patchEventBodySchema>;
export type CreateTrackBody = z.infer<typeof createTrackBodySchema>;
export type PatchTrackBody = z.infer<typeof patchTrackBodySchema>;
export type CreatePrizeBody = z.infer<typeof createPrizeBodySchema>;
export type PatchPrizeBody = z.infer<typeof patchPrizeBodySchema>;
