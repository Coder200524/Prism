import { z } from "zod";

export const createProjectBodySchema = z.object({
  eventId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(5000).optional().default(""),
  repoUrl: z.string().max(2000).optional().default(""),
  demoUrl: z.string().max(2000).optional().default(""),
  trackId: z.string().nullable().optional(),
});

export const patchProjectBodySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().max(5000).optional(),
  repoUrl: z.string().max(2000).optional(),
  demoUrl: z.string().max(2000).optional(),
  trackId: z.string().nullable().optional(),
});

export const galleryQuerySchema = z.object({
  eventId: z.string().optional(),
  trackId: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(100),
});

export type CreateProjectBody = z.infer<typeof createProjectBodySchema>;
export type PatchProjectBody = z.infer<typeof patchProjectBodySchema>;
export type GalleryQuery = z.infer<typeof galleryQuerySchema>;
