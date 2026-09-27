import { z } from "zod";

export const createWebhookSchema = z.object({
  url: z.string().url("Valid URL is required"),
  events: z.array(z.string()).min(1, "At least one event type is required"),
  secret: z.string().optional(),
});

export const updateWebhookSchema = z.object({
  url: z.string().url("Valid URL is required").optional(),
  events: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

export type CreateWebhookBody = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookBody = z.infer<typeof updateWebhookSchema>;
