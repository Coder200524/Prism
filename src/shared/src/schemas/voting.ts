import { z } from "zod";

export const castVoteBodySchema = z.object({
  projectId: z.string().min(1),
});

export type CastVoteBody = z.infer<typeof castVoteBodySchema>;
