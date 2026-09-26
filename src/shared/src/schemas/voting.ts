import { z } from "zod";

export const castVoteBodySchema = z.object({
  projectId: z.string().min(1),
});

export type CastVoteBody = z.infer<typeof castVoteBodySchema>;

export const voidVoteBodySchema = z.object({
  reason: z.string().min(1).max(1000),
});

export type VoidVoteBody = z.infer<typeof voidVoteBodySchema>;
