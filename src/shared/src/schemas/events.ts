import { z } from "zod";

const isoDateTime = z
  .string()
  .min(1)
  .refine(
    (value) => {
      // Reject bare numbers / short numeric strings that Date.parse accepts
      // (e.g. "1" → 2001-01-01) and require a real calendar datetime.
      if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) {
        return false;
      }
      const parsed = Date.parse(value);
      return !Number.isNaN(parsed);
    },
    { message: "Invalid datetime" },
  );

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
