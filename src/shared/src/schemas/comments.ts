import { z } from "zod";

export const createCommentBodySchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty").max(2000, "Comment is too long"),
});

export const hideCommentBodySchema = z.object({
  reason: z.string().trim().min(1, "Reason cannot be empty").max(1000, "Reason is too long"),
});
