import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const fixtureEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  submissions_close: z.string(),
  submissions_open: z.string().optional(),
  description: z.string().optional(),
});

const fixtureTrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

const fixtureJudgeSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  tracks: z.array(z.string()),
});

const fixtureTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  members: z.array(z.string().email()),
});

const fixtureProjectSchema = z.object({
  id: z.string(),
  team: z.string(),
  track: z.string().nullable().optional(),
  title: z.string(),
  summary: z.string().optional(),
  repo_url: z.string().optional(),
  demo_url: z.string().optional(),
  submitted_at: z.string().nullable().optional(),
});

const fixtureScoreSchema = z.object({
  judge: z.string(),
  project: z.string(),
  criteria: z.record(z.number().int()),
  comment: z.string().optional(),
});

export const fixturesSchema = z.object({
  event: fixtureEventSchema,
  tracks: z.array(fixtureTrackSchema),
  judges: z.array(fixtureJudgeSchema),
  teams: z.array(fixtureTeamSchema),
  projects: z.array(fixtureProjectSchema),
  scores: z.array(fixtureScoreSchema),
});

export type Fixtures = z.infer<typeof fixturesSchema>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function resolveFixturesPath(): string {
  const candidates = [
    path.resolve(process.cwd(), "fixtures.json"),
    path.resolve(process.cwd(), "../../fixtures.json"),
    path.resolve(__dirname, "../../../../../fixtures.json"),
    path.resolve(__dirname, "../../../../fixtures.json"),
  ];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error(`fixtures.json not found (tried: ${candidates.join(", ")})`);
}

export function loadFixtures(): Fixtures {
  const raw = JSON.parse(readFileSync(resolveFixturesPath(), "utf8")) as unknown;
  return fixturesSchema.parse(raw);
}

export function equalWeightsSummingTo100(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(100 / count);
  const weights = Array.from({ length: count }, () => base);
  weights[0] = (weights[0] ?? 0) + (100 - base * count);
  return weights;
}

export function titleCaseKey(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}
