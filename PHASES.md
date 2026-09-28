# Cursor build prompts — paste one phase at a time (HISTORICAL)

> **Historical build playbook** used during the hackathon. The application is past these phases.
> Prefer README / ARCHITECTURE / DATA-MODEL / JUDGING / THREAT-MODEL for current behaviour.
> Official acceptance still verifies **T1/T2 only** via `run.py`.

How to use:
1. At kickoff, put `docs/SPEC.md`, `.cursor/rules/dogfood.mdc`, `fixtures.json` and `run.py` in the
   repo root (the rules file goes in `.cursor/rules/`).
2. Open Cursor in **Agent** mode.
3. Paste **one phase**, wait until it finishes, check its "Done when" list yourself, commit, and only
   then paste the next phase. Don't paste everything at once: Cursor does much better with one phase
   at a time.
4. If a check fails, tell Cursor exactly what failed (paste the error) and ask it to fix only that.

Team split once Phase 2 is merged (each on their own branch):
- Lead: phases 0–2, 5, 9 and merging
- P2: phase 3 (T1 API) then phase 6 (T1 pages)
- P3: phase 4 (T2 API) including tests for normalization and assignment
- P4: phase 7 (T2 pages), shared components, then phase 8 tests with P3

---

## Phase 0 — Scaffold

```
Read docs/SPEC.md sections 1, 2, 3, 15 and 18.

Create the project scaffold exactly as in section 3:
- npm workspaces: src/shared, src/server, src/web; tsconfig.base.json with strict mode
- root scripts: dev, build, typecheck, lint, format, test
- ESLint (typescript-eslint, flat config) + Prettier
- src/server: Express 5 app with createApp() in app.ts and listen in index.ts, config.ts
  validating env with zod, error-handler middleware, HttpError class, GET /api/health,
  404 JSON for unknown /api routes, static serving of src/web/dist with SPA fallback
- src/web: React 18 + Vite + React Router + TanStack Query + Tailwind, a Layout with a nav bar
  and a placeholder home page; Vite dev server proxies /api to the Express server
- Dockerfile (multi-stage) and docker-compose.yml with db (postgres:16-alpine, healthcheck)
  and app (port 8080), as in section 15
- .env.example, .dockerignore, .gitignore

Do not add any business logic yet.

Done when:
- `docker compose up --build` serves the React page at http://localhost:8080
- http://localhost:8080/api/health returns {"status":"ok"}
- npm run typecheck and npm run lint pass
```

## Phase 1 — Database schema and seed

```
Read docs/SPEC.md sections 5 and 13. Open fixtures.json and list its real top-level keys and
the fields of each record type before writing anything.

1. Create src/server/prisma/schema.prisma exactly as in section 5 and generate the first migration.
2. Build src/server/src/seed (index.ts + fixtures.ts) following section 13 step by step:
   idempotent upserts, fixture ids preserved, users from judge and team member emails,
   criteria from score keys with equal weights summing to 100, each score row becomes a SUBMITTED
   assignment, duplicate detection, demo accounts, the four fixed demo tokens (hashed), the second
   "Demo Open Hack" event, and a boxed summary printed on boot.
3. Wire the container command: prisma migrate deploy && seed && start server.
4. If fixtures.json has keys or cases not covered in section 13, import them sensibly and write
   the mapping into DATA-MODEL.md (create the file with a "Fixture mapping" section).

Done when:
- docker compose up prints the summary with counts that match fixtures.json
- restarting the container prints the same counts (idempotent)
- the flat-scoring judge, the unfinished batches and the duplicate project exist in the DB
  as described in DATA-MODEL.md
```

## Phase 2 — Auth, roles, audit

```
Read docs/SPEC.md sections 4, 7 and 8.

Implement:
- lib/tokens.ts (random token + sha256), lib/clock.ts (now(), overridable in tests),
  lib/audit.ts (audit(req, action, target, data))
- middleware/authenticate.ts (Bearer token → req.user; invalid token = anonymous)
- middleware/authorize.ts: requireAuth, requirePlatformRole, requireEventRole(role, eventIdFrom);
  admin passes every event role check
- middleware/validate.ts (zod body/query)
- modules/auth: register, login, logout, me, with express-rate-limit on login and register
- modules/admin: list users, change platform role
- shared zod schemas for these requests in src/shared
- web: api/client.ts, AuthContext (token in localStorage, me query), RequireRole wrapper,
  Login and Register pages, nav items by role, logout

Done when:
- curl with "Authorization: Bearer demo-organizer-token" on /api/auth/me returns the organizer
  with the ORGANIZER role on the fixture event
- no token → 401, wrong password → 401 invalid_credentials
- login and register work in the browser and the nav changes by role
- typecheck, lint pass
```

## Phase 3 — Tier 1 API (events, teams, projects, gallery)

```
Read docs/SPEC.md sections 6, 7 and 9.

Implement modules events (with phase.ts), teams and projects (with duplicates.ts) exactly as
specified, including:
- every endpoint and permission in the section 9 tables
- the exact order of checks for POST /api/projects (deadline check before body validation)
- the same deadline check on project edit, submit, team create, team join and team leave
- gallery: public, SUBMITTED projects of published events only, search on title + summary,
  filter by eventId and trackId, default pageSize 100, ordered by submittedAt then id
- one team per user per event (the DB unique index plus a friendly 409)
- judge/participant role conflict → 409 role_conflict
- invite codes, invite link rotation
- audit rows for every change, including project.submit_refused_deadline
- shared zod schemas in src/shared

Done when these curl checks pass against docker compose:
- GET /api/projects with no token → 200 and contains fixture project titles
- POST /api/projects with the participant token and body {"title":"x","summary":"y"}
  → 403 submissions_closed
- POST /api/events as participant → 403; as organizer → 201
- creating a team in "Demo Open Hack", joining via the invite code, creating and submitting
  a project all succeed; the project appears in the gallery
- typecheck, lint pass
```

## Phase 4 — Tier 2 API (judging)

```
Read docs/SPEC.md sections 10, 11 and 12 carefully. This is the most important part of the project.

Implement module judging and module dashboard and module audit:
- rubric GET/PUT with weight-sum = 100 validation and criterion_in_use protection
- judge invites (no email sending: return the link), accept with email match and role conflict
  check, judge tracks, remove judge
- assignment.ts as a pure function following section 11 exactly, plus the auto/manual/delete
  endpoints
- judge workspace endpoints, own assignments only
- GET /api/judge/scores following the rules in section 10 exactly; log access.denied_peer_scores
  on refusal
- normalization.ts as a pure function following section 12 exactly, including both fallbacks,
  clamping and ranking order; results.ts builds organizer and public views from it
- results publish/unpublish (publishing closes judging)
- dashboard endpoint with totals, per-judge, per-project and flags
- CSV export with the exact headers in section 10, using lib/csv.ts with escaping and the
  formula-injection guard
- audit list endpoint with a human-readable summary per row

Also write the unit tests for normalization.ts and assignment.ts described in section 17 now.

Done when:
- GET /api/judge/scores as judge A → 200 with only judge A's scores
- GET /api/judge/scores?judge=<judge A id> as judge B → 403
- GET /api/judge/scores as participant → 403
- GET /api/events/<fixture event id>/export.csv as organizer → 200, first line is the header
- judge B gets 403 on judge A's assignment detail and score update
- the flat-scoring fixture judge shows as flat_scorer on the dashboard
- unit tests pass, typecheck and lint pass
```

## Phase 5 — Acceptance checker

```
Read docs/SPEC.md section 16. Create .dogfood.toml at the repo root, replacing the placeholders
with the real first judge id and event id from fixtures.json.

With docker compose running, run:
  python run.py .dogfood.toml > acceptance-report.txt
Show me the report. If any line is FAIL, fix the backend (never the checker or the toml routes
to dodge a check) and run it again until all 7 lines PASS. Commit acceptance-report.txt.
```

## Phase 6 — Tier 1 pages

```
Read docs/SPEC.md section 14. Build these pages with the shared components (create the components
first: Button, Input, Select, Textarea, Table, Badge, Card, EmptyState, ErrorMessage, Countdown,
CopyLink):
Home (events list), EventPage, Gallery (search + event + track filters kept in the URL query),
ProjectPage, MyTeams, create team, JoinTeam, SubmitProject (save draft, submit, edit, read-only with
a clear message after the deadline), OrganizerHome, EventForm (with tracks and prizes),
EventManage Settings tab, Admin users page.

Use TanStack Query hooks in api/hooks, one file per module. Show API error messages to the user.
Keep the design simple as specified. No external assets.

Done when a full T1 flow works in the browser on Demo Open Hack: register → create team → copy
invite link → second user joins in a private window → draft → submit → appears in the gallery,
and the fixture event's project form is read-only with "Submissions closed".
```

## Phase 7 — Tier 2 pages

```
Read docs/SPEC.md section 14. Build:
- EventManage tabs: Rubric (editable rows, live weight sum must equal 100 before saving),
  Judges (invite form → copyable link, judge list with tracks), Assignments (auto-assign button,
  table, unassignable list), Dashboard (refetchInterval 5000, progress bars, flags list),
  Results (per track: rank, title, review count, raw, normalized, flags; publish/unpublish;
  two CSV download buttons), Audit log (paginated table)
- Judge pages: JudgeHome, ScoreForm (one input per criterion with its range and description,
  comment, Save draft, Submit), MyScores, AcceptJudgeInvite
- Public Results page for published events

CSV download must send the Bearer token (fetch the blob through api/client.ts, then trigger the
download), because a plain link would not include the token.

Done when a full T2 flow works in the browser on Demo Open Hack: organizer sets the rubric →
invites a judge → judge accepts → auto-assign → judge scores → the dashboard updates within 5
seconds without a reload → organizer publishes → public results page shows the ranking.
```

## Phase 8 — Tests

```
Read docs/SPEC.md section 17. Set up the test database and helpers in tests/helpers
(test app from createApp(), db reset, token factory, fixed clock).

Write every test file listed in section 17. The permission matrix must be table-driven and cover
every protected endpoint for anonymous, participant, judge A, judge B, organizer and admin.

Done when npm test passes with zero failures and the matrix covers every route in sections 9 and 10.
```

## Phase 9 — Documentation and final check

```
Read docs/SPEC.md section 19. Write README.md, ARCHITECTURE.md, DATA-MODEL.md (complete it) and
JUDGING.md from the actual code, not from the spec. Include a worked normalization example using
real numbers from the fixture data. List honest limitations (for example: no email delivery,
invites are copy-paste links; T3 and T4 not implemented).

Then do a final check:
1. docker compose down -v
2. turn off Wi-Fi
3. docker compose up
4. python run.py .dogfood.toml > acceptance-report.txt
5. click through the T1 and T2 flows

Report anything that failed.
```
