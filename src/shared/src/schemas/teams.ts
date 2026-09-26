import { z } from "zod";

export const createTeamBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export type CreateTeamBody = z.infer<typeof createTeamBodySchema>;
