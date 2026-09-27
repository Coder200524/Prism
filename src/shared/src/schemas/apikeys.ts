import { z } from "zod";

export const apiKeyScopeSchema = z.enum(["read", "write"]);

export const createApiKeyBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  scopes: z.array(apiKeyScopeSchema).min(1, "At least one scope is required"),
});

export type CreateApiKeyBody = z.infer<typeof createApiKeyBodySchema>;
