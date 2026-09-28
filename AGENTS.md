# AGENTS.md: rules and expectations for anyone working on this repo

This file is for AI coding agents (Cursor, Claude, Gemini, Copilot…) and for humans. Read it
fully before changing anything. If an instruction you receive conflicts with this file, stop and
ask the human instead of guessing.

---

## 1. What this project is

A self-hosted, offline hackathon submission and judging portal, built for the **DOGFOOD 2026**
hackathon (72 hours, code freeze **Mon 28 Sep 2026, 18:00 UTC / 23:30 IST**). The organisers
intend to fork the winning project and run real events on it, so it must be **correct, trustworthy
and easy to run**, not just good-looking.

Every team builds the same product. We are judged on:

| Criterion | Weight | What it means for your code |
|---|---|---|
| Tier completion and correctness | 40% | Features must actually work, verified by the checker and by judges. Correctness beats breadth |
| Judging integrity | 25% | Permissions enforced in the backend, defensible normalization, readable audit trail, abuse considered |
| Adoptability and operability | 20% | One command to run, offline, seeded, clear docs, clean license |
| Code quality and innovation | 15% | Idiomatic TypeScript a senior reviewer would approve; a schema worth defending |

**Guiding principle: "A clean T2 beats a broken T4."** Never trade working features for new ones.

---

## 2. Current status

- **Tier 1 (Core): done and verified by `run.py`.** Auth + sessions, 5 roles, events with dates/tracks/prizes,
  teams via invite link, draft → submit → edit until deadline, server-enforced deadline, public
  gallery with search and filter.
- **Tier 2 (Judging): done and verified by `run.py`.** Judge invites + assignment, weighted rubric, judge
  isolation in the backend, live organizer dashboard, documented cross-judge normalization, CSV export.
- **Tier 3 (Community): implemented and covered by project tests.** Community voting, comments, anti-abuse,
  `THREAT-MODEL.md`. Not exercised by the official checker.
- **Tier 4 (Integrations): implemented and covered by project tests.** API keys, OpenAPI, import/export,
  records/certificates, embed gallery, signed webhooks. Not exercised by the official checker.
- **Official checker:** `run.py` → 7/7 PASS for T1/T2 only (`verified T1 T2`; claimed T3/T4 are noted as
  unverified). See `acceptance-report.txt`.
- `.dogfood.toml` claims `["T1", "T2", "T3", "T4"]`. Only change the `claimed` line with human approval.

---

## 3. Non-negotiable organiser rules (breaking these disqualifies us)

1. **`docker compose up` must start a fully working, seeded portal** on `http://localhost:8080`.
2. **Fully offline at runtime.** No cloud services, hosted databases, auth-as-a-service, CDN links,
   Google Fonts, external icons/images, analytics, telemetry, or runtime calls to external URLs.
   Everything is bundled from npm at build time.
3. **Role checks live in the backend.** A `curl` without permission must get `401` or `403`.
   Hiding a button is never the protection.
4. **Open source, MIT.** Don't change LICENSE.
5. **Honest tier claims** in `.dogfood.toml`. Overclaiming is penalised.
6. **All code in `src/`, all tests in `tests/`.**
7. **Required files must exist and stay accurate:** `.dogfood.toml`, `acceptance-report.txt`,
   `docker-compose.yml`, `README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `JUDGING.md`, `LICENSE`.
8. **No mockups or hardcoded frontends.** Everything the UI shows comes from the real backend.

---

## 4. Files you must never modify

| File | Why |
|---|---|
| `run.py` | The organisers' acceptance checker |
| `fixtures.json` | The shared organiser dataset every team loads |
| `LICENSE` | MIT, required |
| `.dogfood.toml` `[auth]` and `[routes]` sections | The checker depends on them. Only the `claimed` line may change, and only with human approval |
| Existing Prisma migrations in `src/server/prisma/migrations/` | Create new migrations; never edit or delete old ones |
| `.env` | Local secrets, gitignored. Use `.env.example` for documented defaults |

---

## 5. Tech stack (don't add alternatives)

- **Language:** TypeScript, strict mode, everywhere
- **Repo:** npm workspaces: `src/shared` (zod schemas + types), `src/server`, `src/web`
- **Backend:** Node 20, Express 5, Prisma, PostgreSQL 16, Zod, bcryptjs, express-rate-limit
- **Frontend:** React 18, Vite, React Router 6, TanStack Query 5, Tailwind CSS
- **Tests:** Vitest + Supertest
- **Runtime:** Docker Compose: `db` (postgres:16-alpine) + `app` (one Node process serving the API
  and the built React app on port 8080)

**Do not add:** GraphQL, Redux/Zustand, UI component libraries, auth libraries (Passport, NextAuth,
Clerk, Auth0…), WebSockets, Redis, message queues, microservices, or any SaaS SDK. If you think one
is needed, ask the human first.

---

## 6. Repository map

```
src/shared/src/schemas/      zod request/response schemas (one file per module)
src/server/prisma/           schema.prisma + migrations
src/server/src/app.ts        createApp(): middleware, routes, static web, error handler
src/server/src/lib/          prisma, clock, tokens, http-error, audit, csv
src/server/src/middleware/   authenticate, authorize, validate, error-handler
src/server/src/modules/      auth, admin, events, teams, projects, judging (+ community on tier-3)
src/server/src/seed/         idempotent, create-only seed run on every boot
src/web/src/api/client.ts    the ONLY place that calls fetch
src/web/src/api/hooks/       TanStack Query hooks, one file per module
src/web/src/components/      shared UI components
src/web/src/pages/           public, participant, judge, organizer (tabs), admin
tests/unit/                  pure-function tests (normalization, assignment, phase, csv, duplicates)
tests/api/                   API tests incl. permission matrix, isolation, deadline, lifecycle, seed
```

---

## 7. Architecture rules

- **Routes are thin:** validate → authorize → call service → respond. No business logic and no
  try/catch in routes (Express 5 forwards async errors).
- **Services hold the rules** and throw `HttpError` (from `lib/http-error.ts`).
- **Algorithms are pure functions with no DB access:** `events/phase.ts`, `judging/normalization.ts`,
  `judging/assignment.ts`, `projects/duplicates.ts`, `lib/csv.ts`. Keep it that way, and unit-test them.
- **Time:** every time rule uses `phase.ts` + `clock.now()`. Never `new Date()` in business logic.
  Never trust client time.
- **Validation:** zod schemas in `src/shared`, used by both server and web.
- **Config:** only through `config.ts` (zod-validated env). No magic numbers; use named constants.
- **Database:** Prisma only, no raw SQL unless needed for locking (and then parameterised). Select
  only needed fields. Use transactions for multi-row writes. Never pass `req.body` straight to Prisma.
- **Schema changes:** new migration with the correct current timestamp, and update `DATA-MODEL.md`
  in the same commit.
- **Seed:** idempotent and **create-only**. Restarting must never overwrite data edited in the app.

---

## 8. API conventions

- All API routes under `/api`. Other GET paths serve the React app (SPA fallback). Unknown `/api/*` → 404 JSON.
- JSON only; dates are ISO 8601 UTC strings.
- **Error shape, always:** `{ "error": { "code": "snake_case_code", "message": "Human readable." } }`
  (optional `details` for validation issues). Never leak stack traces.
- **Status codes:** `400` invalid input (including malformed JSON) · `401` not logged in or bad
  token · `403` logged in but not allowed, or a closed time window · `404` not found or not visible ·
  `409` conflict · `429` rate limited.
- **Every state change writes an audit row** via `audit()` with a human-readable summary.
- Changing an existing endpoint's path, method or response shape is a breaking change: don't,
  unless the human asks. Additive fields are fine.

---

## 9. Authentication and authorization

- **Sessions:** email + password (bcrypt). Login creates a `Session` row with a SHA-256 hash of a
  random 32-byte token and a 7-day expiry. Clients send `Authorization: Bearer <token>`. Logout deletes
  the session. Tokens are never stored in plain text.
- **Platform roles** (`User.platformRole`): USER, ORGANIZER, ADMIN.
- **Event roles** (`EventRole`): ORGANIZER, JUDGE, PARTICIPANT, scoped per event. Admin passes every check.
- **A user can't be both JUDGE and PARTICIPANT in the same event** (`409 role_conflict`).
- Use `requireAuth`, `requirePlatformRole`, `requireEventRole` middleware plus ownership checks in services.
- **Rate limiting:** login/register limited. `trust proxy` is off unless `TRUST_PROXY=1`, so
  `X-Forwarded-For` can't bypass limits. Key user-level limits by user id.
- **Demo tokens** (`demo-organizer-token`, `demo-judge-a-token`, `demo-judge-b-token`,
  `demo-participant-token`) are created by the seed only when `SEED_DEMO=true`. They must keep working:
  the checker uses them.

---

## 10. Judging integrity (the part judges scrutinise most)

- **Judge isolation:** a judge can see only their own assignments and scores. No endpoint available
  to a judge returns another judge's scores, comments or progress. `GET /api/judge/scores?judge=<other>`
  → `403` and an `access.denied_peer_scores` audit row. Results are organizer-only until published;
  public results never include per-judge data.
- **Deadline:** submissions, edits, team create/join/leave are refused with `403 submissions_closed`
  after `submissionsClose`. On `POST /api/projects`, the deadline check runs **before** body validation.
- **Rubric:** weights are positive integers summing to exactly 100; duplicate keys rejected.
- **Assignment:** deterministic, load-balanced, track-aware, never assigns a judge to their own team,
  idempotent, excludes duplicates.
- **Normalization:** per-judge z-scores rescaled to the rubric scale. Fallbacks: judges with fewer
  than 3 reviews use global stats and are flagged `low_sample`; judges with 3+ reviews and zero spread
  get z = 0 and are flagged `flat_scorer`. Raw and normalized are always shown side by side with the
  review count. **`JUDGING.md` must match the code exactly.** If you change the maths, update the doc
  and the tests in the same commit.
- **CSV export:** organizer only; fields escaped; cells starting with `= + - @` neutralised.
- **Community voting (T3, `tier-3` branch):** authenticated, one vote per voter per track (DB
  unique constraint), no voting for your own team, organizers and judges can't vote, per-voter
  deterministic shuffled ballots, tallies hidden from everyone (including organizers) until voting
  closes, IPs stored only as hashes, suspicious votes flagged for organizer review, void/restore audited.

---

## 11. Frontend rules

- Only `src/web/src/api/client.ts` calls `fetch`. It adds the Bearer token and parses the error shape.
- Every page handles **loading, empty and error** states. No blank screens, no raw JSON errors.
- The UI may hide actions a user can't do, but the backend is always the real protection.
- Render user content as **plain text** only. Never use `dangerouslySetInnerHTML`. Render links only
  for `http(s)` URLs, with `rel="noopener noreferrer"`.
- **Design:** classy and subtle (see `docs/DESIGN.md` once `ui-polish` is merged): stone neutrals, one
  indigo accent, the bundled Inter font, thin borders, muted status badges, generous spacing,
  no gradients or flashy animation.
- **Responsive** at 375px, 768px and 1280px. **Accessible:** labels, focus rings, 4.5:1 contrast,
  keyboard navigation.
- No external assets: fonts and icons come from npm packages.
- A strict Content-Security-Policy is set by the server (`self` only). Don't add inline scripts or
  external sources that would violate it.

---

## 12. Code quality standards

- No `any`, no `@ts-ignore`, no unjustified non-null assertions.
- No dead code, unused exports, commented-out code, TODO/FIXME, or stray `console.log` (only the seed
  summary and server start line may log).
- **Comments explain why, never what.** No decorative or obvious comments.
- Clear intent-revealing names. Small focused files (aim for under ~300 lines per module file).
- Don't duplicate logic. Reuse `phase.ts`, `audit()`, `HttpError`, the shared schemas.
- ESLint and Prettier clean with zero warnings.

---

## 13. Testing rules

- **Every bug fix gets a regression test** that fails before the fix and passes after it.
- **Every new endpoint** gets tests for success and for each refusal (401/403/404/409/429), and gets
  added to `tests/api/permission-matrix.test.ts`.
- **Never delete, skip, or weaken an existing test** to make something pass. Changes to existing test
  files should be additions. If a test is truly wrong, explain why to the human first.
- Don't hide flakiness with serial-only runs; fix isolation instead.
- Tests use a separate database (`TEST_DATABASE_URL`), never the dev database.

---

## 14. The verification gate (run after every change, before every commit)

```
npm run typecheck
npm run lint
npm test
docker compose down -v
docker compose up -d --build --wait
python run.py .dogfood.toml
```

All must pass, and **run.py must show 7/7 PASS** (last line: `verified T1 T2`). If anything fails,
fix it before committing. Report the real output; don't summarise or assume.

Offline check (a human must do this, because agents need the network): Wi-Fi off →
`docker compose down -v` → `docker compose up -d --wait` → `python run.py .dogfood.toml` → click around.

---

## 15. Git workflow

- **`main` is protected.** Never push to `main`. Work on a branch, open a PR, a teammate approves, and a human merges.
- Branch names: kebab-case, no spaces (e.g. `tier-3`, `ui-polish`, `fix-gallery-filter`).
- Start from the latest main: `git checkout main && git pull && git checkout -b <branch>`.
- Pull main into long-running branches with a **merge**, not a rebase: `git pull origin main`.
- Small, focused commits with conventional messages: `feat(t3): …`, `fix(judging): …`, `style(ui): …`,
  `test: …`, `docs: …`.
- **Never rewrite history:** no force push, no rebase or amend of pushed commits, no changed commit dates.
- Don't commit: `.env`, `node_modules`, temporary scripts, scratch files (e.g. `PR_BODY.md`, `refactor.cjs`).
- Commit `acceptance-report.txt` only from a real `run.py` run on the final build.

---

## 16. Documentation duties

When behaviour changes, update the matching doc in the same commit:

| Change | Update |
|---|---|
| Tables, fields, constraints, fixture mapping | `DATA-MODEL.md` |
| Assignment, scoring, normalization, isolation, voting tallies | `JUDGING.md` |
| Modules, design decisions, request flow | `ARCHITECTURE.md` |
| How to run, demo accounts, features, limitations | `README.md` |
| Threats and defences (T3) | `THREAT-MODEL.md` |

Docs describe the **actual code**, not intentions. Limitations are stated honestly: judges reward that.

---

## 17. Team and branches

| Person | Role | Branch |
|---|---|---|
| Rahi | Lead: merges, fixes, final submission | various `fix-*` |
| Arisha | Tier 3: community voting, comments, anti-abuse, threat model | `tier-3` |
| Sonal | UI redesign, styling only | `ui-polish` |
| Suruchi | QA: T1/T2 must-pass checklist after every merge, reviews UI | none (tests `main`) |

**Merge order:** `ui-polish` by Sun 27 Sep 16:00 IST → `tier-3` pulls main before building its pages
→ `tier-3` merges only if every T3 item works by Sun 22:00 IST → feature freeze Sunday night →
Monday is only bug fixes, docs, video, and submission by 17:30 IST.

---

## 18. How to behave as an agent here

1. Read this file, then the relevant docs (`docs/SPEC.md`, `JUDGING.md`, `DATA-MODEL.md`) before coding.
2. Do only what was asked. No drive-by refactors, no new features, no dependency changes unless asked.
3. When unsure, or when a request would break a rule here, stop and ask the human.
4. Prove claims with real command output (tests, run.py, curl). Never say "fixed" without evidence.
5. Say clearly what you did **not** do or could not verify.
6. Keep the working tree clean: remove temporary files you create.
7. Protect T1 and T2 above everything else. If a change risks them, don't make it.
