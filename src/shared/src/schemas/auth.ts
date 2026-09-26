import { z } from "zod";

export const platformRoleSchema = z.enum(["USER", "ORGANIZER", "ADMIN"]);
export const eventRoleTypeSchema = z.enum(["ORGANIZER", "JUDGE", "PARTICIPANT"]);

export const registerBodySchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(200),
});

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  platformRole: platformRoleSchema,
  createdAt: z.string().datetime(),
});

export const authTokenResponseSchema = z.object({
  token: z.string(),
  user: publicUserSchema,
});

export const meResponseSchema = z.object({
  user: publicUserSchema,
  roles: z.array(
    z.object({
      eventId: z.string(),
      role: eventRoleTypeSchema,
    }),
  ),
});

export const patchUserBodySchema = z.object({
  platformRole: platformRoleSchema,
});

export const adminUserSchema = publicUserSchema;

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type PatchUserBody = z.infer<typeof patchUserBodySchema>;
