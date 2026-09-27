import { z } from "zod";

export const importEventSchema = z.object({
  event: z.object({
    id: z.string().optional(),
    name: z.string().trim().min(1),
    description: z.string().optional().default(""),
    maxTeamSize: z.number().int().positive().optional().default(4),
    reviewsPerProject: z.number().int().positive().optional().default(3),
    submissionsOpen: z.string().optional(),
    submissionsClose: z.string().optional(),
    submissions_close: z.string().optional(),
    judgingClose: z.string().nullable().optional(),
    votingOpen: z.string().nullable().optional(),
    votingClose: z.string().nullable().optional(),
  }),
  tracks: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1),
        description: z.string().optional().default(""),
      }),
    )
    .optional()
    .default([]),
  prizes: z
    .array(
      z.object({
        id: z.string().optional(),
        trackId: z.string().nullable().optional(),
        name: z.string().trim().min(1),
        description: z.string().optional().default(""),
        value: z.string().optional().default(""),
        place: z.number().int().nullable().optional(),
      }),
    )
    .optional()
    .default([]),
  criteria: z
    .array(
      z.object({
        id: z.string().optional(),
        key: z.string().trim().min(1),
        name: z.string().trim().min(1),
        description: z.string().optional().default(""),
        weight: z.number().int().min(0),
        minScore: z.number().int().optional().default(1),
        maxScore: z.number().int().optional().default(5),
        position: z.number().int().optional(),
      }),
    )
    .optional()
    .default([]),
  judges: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1),
        email: z.string().trim().email(),
        tracks: z.array(z.string()).optional().default([]),
      }),
    )
    .optional()
    .default([]),
  teams: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1),
        inviteCode: z.string().optional(),
        members: z.array(z.string()).optional().default([]),
      }),
    )
    .optional()
    .default([]),
  projects: z
    .array(
      z.object({
        id: z.string().optional(),
        teamId: z.string().optional(),
        team: z.string().optional(),
        trackId: z.string().nullable().optional(),
        track: z.string().nullable().optional(),
        title: z.string().trim().min(1),
        summary: z.string().optional().default(""),
        repoUrl: z.string().optional(),
        repo_url: z.string().optional(),
        demoUrl: z.string().optional(),
        demo_url: z.string().optional(),
        status: z.string().optional().default("SUBMITTED"),
        submittedAt: z.string().nullable().optional(),
        submitted_at: z.string().nullable().optional(),
      }),
    )
    .optional()
    .default([]),
  scores: z
    .array(
      z.object({
        id: z.string().optional(),
        judge: z.string().optional(),
        judgeId: z.string().optional(),
        project: z.string().optional(),
        projectId: z.string().optional(),
        criteria: z.record(z.string(), z.number()).optional(),
        scores: z
          .array(
            z.object({
              criterionKey: z.string(),
              value: z.number().int(),
            }),
          )
          .optional(),
        comment: z.string().optional().default(""),
      }),
    )
    .optional()
    .default([]),
  votes: z.array(z.any()).optional().default([]),
  comments: z.array(z.any()).optional().default([]),
});

export type ImportEventInput = z.infer<typeof importEventSchema>;
