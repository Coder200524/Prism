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
  VOTING_SECRET: z.string().default("default-voting-secret-for-dev"),
  SIGNING_KEY_SECRET: z.string().default("default-signing-key-secret-for-dev"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env.NODE_ENV === "production" && !env.SIGNING_KEY_SECRET) {
    throw new Error(
      "FATAL: SIGNING_KEY_SECRET environment variable must be set in production mode.",
    );
  }
  return envSchema.parse(env);
}

export const config = loadConfig();
