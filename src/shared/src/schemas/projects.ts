import { z } from "zod";

const safeUrl = z
  .string()
  .max(2000)
  .refine((val) => val === "" || val.startsWith("http://") || val.startsWith("https://"), {
    message: "Must be a valid http or https URL",
  });

export const createProjectBodySchema = z.object({
  eventId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(5000).optional().default(""),
  repoUrl: safeUrl.optional().default(""),
  demoUrl: safeUrl.optional().default(""),
  trackId: z.string().nullable().optional(),
});

export const patchProjectBodySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().max(5000).optional(),
  repoUrl: safeUrl.optional(),
  demoUrl: safeUrl.optional(),
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
