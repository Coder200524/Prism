import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/dogfood"),
  PUBLIC_URL: z.string().url().default("http://localhost:8080"),
  SEED_DEMO: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}

export const config = loadConfig();
