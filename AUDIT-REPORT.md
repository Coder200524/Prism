# DOGFOOD 2026 — Pre-submission Audit (HISTORICAL)

> **Historical snapshot** from commit `b35e1de` on 2026-09-26, when only T1/T2 were claimed.
> The live codebase now also implements T3 and T4 (see README and `.dogfood.toml`).
> Do **not** treat the findings below as the current submission status.
> Current official checker output lives in `acceptance-report.txt`
> (`run.py` still verifies **T1/T2 only**).

Audited commit `b35e1de` on 2026-09-26. Every claim below comes from a command I ran against the live
`docker compose` stack or from a file and line I read. Things I could not check are marked **NOT VERIFIED**.

## Verdict (as of 2026-09-26)

1. **T1: PASSES, with defects.** Every official T1 item works through the API. Deadlines hold on the server
   clock and could not be bypassed. But there is a stored XSS hole on project URLs, a team-size race, and a
   login rate limit that can be bypassed.
2. **T2: PASSES, with defects.** Judge isolation held against every trick tried. Normalization matched my
   independent recomputation on all 41 projects with 0 mismatches. CSV export and the live dashboard work.
   The weakest spots are misleading judge flags, a rubric that can be saved with weights not summing to 100,
   and fixture scoring edits that are silently reverted on every restart.
3. **The tier claim in `.dogfood.toml` at audit time (`T1 T2`) was honest** as far as features went.

---

## Acceptance checker

`python run.py .dogfood.toml` (Python 3.11.9) against a fresh `docker compose down -v && docker compose up --build -d`:

```
DOGFOOD 2026 acceptance report
portal: http://localhost:8080
claimed: T1 T2
fixtures: fixtures.json

T1  gallery is public ................. PASS
T1  project from fixtures shown ....... PASS
T1  closed event refuses submissions .. PASS
T2  judge sees own scores ............. PASS
T2  judge cannot see peer scores ...... PASS
T2  participant blocked ............... PASS
T2  csv export works .................. PASS

claimed T1 T2, verified T1 T2
```

No FAILs, so there are no root causes to trace. Checks on `.dogfood.toml` itself:

- `peer_scores = /api/judge/scores?judge=jdg_01` is genuine. As organizer it returns 200 with judge A's real
  row (`asgn_jdg_01_prj_07`, scores 2/2/2, "Docs are thin."). As judge A the same data comes from
  `/api/judge/scores`. The route has not been bent to fail safely.
- `jdg_01` is the first fixture judge; `csv_export` points at the real fixture event `evt_01`.
- The checker's late-submission probe gets `403 submissions_closed` because of the deadline, not because the
  body is invalid (`src/server/src/modules/projects/service.ts:174-183`).

**Offline run** (you ran it with the network off; files `offline-report.txt` and `offline-logs.txt`):
- Offline boot: **VERIFIED.** The logs show a fresh migration, the seed summary and `Server listening`, with no errors.
- Offline checker: **7 × FAIL "got no response"**, but the cause is timing, not network. The app container
  started at 10:33:34Z and was listening at 10:33:48.998Z. `offline-report.txt` was written at 10:33:42.9Z,
  six seconds before the server accepted connections. `docker compose up -d` returns before seeding
  finishes, and the `app` service has no healthcheck to wait on. I reran `run.py` against the same
  offline-booted containers and got 7/7 PASS, but by then the network was back on. **Serving requests with
  the network off is NOT VERIFIED.** Rerun it offline, waiting for `/api/health` first.

---

## Tier 1

| Official T1 item | Result | Evidence |
|---|---|---|
| Authentication and sessions | **PARTIAL** | register 201; duplicate email differing only in case 409; password < 8 chars 400; login 200; wrong password and unknown email both `401 invalid_credentials` with the same message; `/me` 200; bad token 401; expired session (row inserted with past `expiresAt`) 401; logout 204, then `/me` 401 and logout again 401. Passwords are bcrypt (`$2b$10$` in DB); tokens are stored as SHA-256 (`Session.tokenHash`). **Rate limit can be bypassed:** 10×401 then 429, but adding `X-Forwarded-For: 10.0.0.N` gives unlimited 401s (`app.ts:24`). |
| Real role model (visitor, participant, judge, organizer, admin) | **PASS** | 30 organizer-only endpoints × {anon, participant, judge A, judge B}: every protected call returned 401 (anon) or 403. Admin promote works: `PATCH /api/admin/users/:id` 200 for admin, 403 for others. |
| Event creation with dates, tracks, prizes | **PASS** (minor) | Organizer POST with 2 tracks and 1 prize: 201, `phase: draft`. open ≥ close 400; close > judgingClose 400; `"soon"` 400; PATCH into a bad date order 400. A plain USER gets 403. A second organizer editing another organizer's event, or evt_01: 403. **Weak:** `"submissionsOpen":"1"` is accepted (`shared/src/schemas/events.ts:3`). |
| Team formation by invite link | **PARTIAL** | Create 201 with `inviteUrl`; anonymous preview 200; second team in the same event 409; teammate join 200; rejoin 409; `team_full` 409; after rotation the old code gives 404 and the new one 200; rotation by a non-member 403. **Race:** 6 concurrent joins on a max-2 team gave two 200s, leaving **3 members** (`teams/service.ts:194`). **Also:** a team can be created on an *unpublished* event (201). |
| Submission with draft and edit until deadline | **PASS** (minor) | Draft 201; second project for the same team 409; submitting while incomplete gives `400 incomplete_project`; teammate edit 200; non-member edit 403; foreign `trackId` 400; submit 200; edit after submit 200; resubmit keeps the first `submittedAt`. **Weak:** after submitting you can PATCH `trackId: null` and the project stays SUBMITTED without a track. |
| Deadline enforcement that actually holds | **PASS** | On closed `evt_01`: create (with and without `eventId`, extra `status`/`submittedAt`/`now` fields, spoofed `Date` header) 403; PATCH 403; PATCH with a different `eventId` 403; submit 403; team create 403; team join 403; leave 403. PUT/POST on `/api/projects/:id` 404. Title unchanged afterwards. All checks use `clock.now()` + `phase.ts`, and there is no `new Date()` in module business logic. |
| Public gallery with search and filter | **PASS** (minor) | Anonymous 200. Page one has 42 items including the fixture titles. `q=glass` finds 2, and summary search works. `eventId`+`trackId` filter gives 6. Drafts are not listed and give 404 by id to anyone outside the team. `pageSize=500` 400; repeated `q` 400. **Weak:** `?q=%` matches everything, because LIKE wildcards are not escaped (`projects/service.ts:96`). |

## Tier 2

| Official T2 item | Result | Evidence |
|---|---|---|
| Judge invitation | **PASS** | Invite 201; anonymous preview 200; wrong user `403 invite_email_mismatch`; anonymous 401; case-insensitive email accept 200; reusing a token 404; bogus token 404. A participant of the same event gets `409 role_conflict`; a judge creating a team gets `409 role_conflict`; an invalid track gives 400. |
| Judge assignment | **PASS** | Auto-assign: `{"created":4}`, then a second run gives `{"created":0}` (idempotent). Load 2/1/1 (max − min = 1). The duplicate project was excluded. Conflict of interest is covered by unit tests. It cannot occur via the API, because judge/participant conflict is enforced. Manual assign and assignment delete: 403 for non-organizers. |
| Weighted rubric the organizer configures | **PARTIAL** | Weights summing to 90 give 400; min ≥ max 400; negative weight 400; judge 403; removing a scored criterion `409 criterion_in_use`. **Bug:** duplicate keys `[{a:50},{a:50}]` pass the sum-100 check, and the rubric is stored as a single criterion with weight **50** (`judging/service.ts:78-129`). |
| Backend role isolation (judges can't see peer scores) | **PASS** | As judge B (`jdg_02`): `?judge=jdg_01` 403, `JDG_01` 403, `jdg_01%20` 403, `../jdg_01` 403, `?judge=jdg_02&judge=jdg_01` 400, `judge[]=`/`judge[0]=` both return only B's own rows (checked by assignment id). `&eventId=evt_01` 403. A's assignment detail 403; PUT A's scores 403; results, dashboard, CSV, assignments list, judges list and audit all 403. Assignment list contains only `asgn_jdg_02_*`. Project detail never includes scores. Case-changed and double-slash paths give 403/404. Same results for a second judge pair in a new event. Anonymous and participants: 401/403 everywhere. **Side issue:** `?judge=jdg_01&eventId=nonexistent` returns **500** (FK violation writing the audit row, `judging/service.ts:753-757`). |
| Live organizer progress dashboard | **PASS** (misleading) | Organizer only (403 for everyone else). Before scoring: 0 of 4 submitted, 0%. After one submit: 1, 25%. After three: 3, 75%. The UI polls every 5 s (`web/src/api/hooks/judging.ts:134`). **Misleading:** `evt_01` shows **100% complete** with no `under_reviewed` flags, although 8 projects have 2 of 3 reviews. It also labels 1-review judges `jdg_01` and `jdg_23` "gave identical scores". |
| Cross-judge normalization, method documented | **PASS** (doc mismatch) | I recomputed independently in Python from `fixtures.json`: μ_g = 3.5662, σ_g = 0.6486 over 126 reviews. `jdg_02`: μ = 4.2233, σ = 0.7340. prj_05: total 3.01, z = −1.6531, normalized 2.4940 (matches JUDGING.md). Worked example prj_07, reviews (total → normalized): 2.33→2.443, 3.67→3.566, 4.66→4.919, 2.00→3.566 (jdg_01, n = 1, σ = 0 so z = 0 and it maps to μ_g), 4.00→4.000 (jdg_12, n = 2, low-sample path, so normalized = total). Raw 3.33, normalized 3.70; API shows 3.33 / 3.70. **All 41 projects match to 0.01.** No NaN (σ = 0 handled at `normalization.ts:171`; weightSum = 0 at `:99`). Raw and normalized appear side by side in results and CSV. **Mismatch:** DATA-MODEL.md says `jdg_01` "has only 1 review (`low_sample` path)", but the code takes the flat branch first (σ = 0 at n = 1), so jdg_01 is flagged `flat_scorer` and gets z = 0. |
| CSV export | **PASS** | Organizer: 200, `text/csv; charset=utf-8`, `Content-Disposition: attachment`, exact spec header. `type=xml` 400; everyone else 401/403. The escaping test used a comment of `Nice, "really"` + newline + `=cmd`, which exported as `"Nice, ""really""\n=cmd"`. A title `=HYPERLINK(...)` became `"'=HYPERLINK(""…"")"`, and `@SUM(A1)` became `'@SUM(A1)`. **Minor:** PENDING rows export `weighted_total` as `0` instead of empty. |
| (spec) Audit trail | **PARTIAL** | Every state change I made produced a row. Refused peer-score access is logged as `access.denied_peer_scores`. **But** 13 of the 15 denial rows have `eventId = NULL` (including the checker's own probe), so they never show in the organizer's Audit tab (`judging/service.ts:753-757`). Summaries are mostly `"score.submit on assignment cmui8…"`, which isn't human-readable. Action names differ from the spec: `team.invite.rotate` vs `team.invite_rotate`, `event.track.*` vs `track.*`. |

---

## Disqualification risks

1. **Backdated commit with a pre-made "all PASS" report.** `e51bff9` has author date `2026-09-25T23:30:00+05:30`
   (= **18:00:00Z, exactly kickoff**) but committer date `2026-09-26T15:13:36+05:30`. It adds
   `acceptance-report.txt` saying "verified T1 T2" *before any application code existed* (all code arrived in
   `b35e1de`). To an organiser this looks like a fabricated report and date manipulation. It is the single
   most dangerous item in this repo. Fix: regenerate `acceptance-report.txt` from a real run and commit it
   with an honest date; be ready to explain the history.
2. **Pre-kickoff artefacts.** The migration is named `20260325173000_init` (25 March 2026, six months before
   kickoff). `PHASES.md` literally reads "At kickoff, put `docs/SPEC.md`… in the repo", which shows the spec
   and prompts were prepared beforehand. No *code* commit predates kickoff (`429fb3f`, 14:18Z, is LICENSE
   only, via GitHub), but these will attract questions. Rename the migration; decide whether planning docs
   are allowed.
3. **`docker compose up` fails on any machine with Postgres on 5432.** `docker-compose.yml:9` publishes
   `5432:5432` *as well as* `5433`. README says 5433 is there "so it does not collide", yet the 5432 binding
   still collides. A judge with local Postgres gets a port-in-use error, and the rules say the portal must start.
4. **Startup race with the checker.** `app` has no healthcheck, and seeding takes ~14 s. A script that runs
   `run.py` right after `up -d` gets 7/7 "no response". That is exactly what happened in your offline run.
5. **Possible runtime outbound call.** Every boot runs `npx prisma migrate deploy` (`Dockerfile:36`). The
   Prisma CLI sends a telemetry "checkpoint" unless `CHECKPOINT_DISABLE=1`. Boot succeeded offline, so it
   doesn't block, but it is technically a runtime call to an external host. Set the env var.
6. **Stored XSS** (Bug 1). This is not a rules violation, but a judge clicking a crafted repo link in the demo
   hands over the session token.

---

## Bugs

### Critical
None found that break a tier outright.

### High

1. **Stored XSS through project URLs → token theft.**
   `shared/src/schemas/projects.ts:7-8,15-16` accept any string; `web/src/pages/public/ProjectPage.tsx:38,48`
   and `web/src/pages/judge/ScoreForm.tsx:77,90` render it as `href`.
   *Reproduce:* PATCH a project with `{"repoUrl":"javascript:alert(document.domain)"}`, then submit. Both
   return 200, and the project is SUBMITTED and public.
   *What happens:* React 18.3.1 does not block `javascript:` hrefs. Clicking the link runs script on the
   portal origin, where the session token sits in `localStorage` (`web/src/api/client.ts:15-18`).
   *Should:* be rejected with 400.
   *Fix:* validate as `z.string().url()` restricted to `http:`/`https:` (allow empty); also guard in the UI.
2. **Login rate limit bypassed with `X-Forwarded-For`.** `app.ts:24` sets `trust proxy 1`, but nothing
   sits in front of the app.
   *Reproduce:* send 12 bad logins (10×401 then 429), then 5 more with `X-Forwarded-For: 10.0.0.N`
   (all 401, never 429).
   *Should:* stay 429.
   *Fix:* remove `trust proxy`, or make it configurable and off by default.
3. **Team size limit is racy.** `teams/service.ts:194` counts members outside the insert transaction.
   *Reproduce:* 6 concurrent `POST /api/teams/invite/:code/join` on a max-2 team with 1 member. Two return
   200, leaving 3 members.
   *Fix:* do the count inside a `Serializable` transaction or behind a row lock (`SELECT … FOR UPDATE` on
   Team) and re-check.
4. **Every restart overwrites live data.**
   `seed/index.ts:127-144,332-366,480-501` upsert *with updates* on every boot.
   *Reproduce:* judge A edits their `evt_01` score, then `docker compose restart app`; the score and comment
   are back to the fixture values. Demo Open Hack's `submissionsClose` moves to boot + 7 days on every boot,
   so any organizer edits are lost. Fixture score `submittedAt` is reset to boot time (`:343,351`), which
   puts fake timestamps on March scores. `duplicateOfId` is reset (`:281`), and fixture invite codes are
   reset to `inv_tm_XX` (`:199-204`), which also un-rotates them.
   *Fix:* on update, touch nothing (or `update: {}`) for rows that already exist; only create missing rows.

### Medium

5. **A draft save wipes the comment and silently edits submitted reviews.**
   `judging/service.ts:682` always writes `body.comment`, which defaults to `""`
   (`shared/src/schemas/judging.ts:32`).
   *Reproduce:* on SUBMITTED `asgn_jdg_01_prj_07`, send PUT `{"scores":{"functionality":5}}`. It returns
   200; the DB then shows comment `""` (was "Docs are thin."), functionality 5, and the audit row says
   `score.save`, not `score.edit_after_submit`.
   *Fix:* only update `comment` when it is provided, and audit as `edit_after_submit` whenever the status
   was already SUBMITTED.
6. **Duplicate rubric keys break the sum-100 invariant.** `judging/service.ts:78-129`.
   *Reproduce:* PUT `[{key:"a",weight:50},{key:"a",weight:50}]` returns 200, and GET shows one criterion,
   weight 50.
   *Fix:* reject duplicate keys with 400.
7. **Malformed JSON returns 500.** The error handler only knows `HttpError` and `ZodError`
   (`middleware/error-handler.ts:32-38`).
   *Reproduce:* POST `/api/projects` with body `{bad` → `500 internal_error`.
   *Fix:* map `err.type === 'entity.parse.failed'` (and `entity.too.large`) to 400/413.
8. **Peer-score denial with an unknown `eventId` returns 500.** `judging/service.ts:753-757` writes an
   `AuditLog.eventId` that violates the FK.
   *Reproduce:* as judge B, GET `?judge=jdg_01&eventId=nonexistent` → 500.
   *Fix:* check the event exists (404), or audit with `eventId: null` and keep the id in `data`.
9. **Denied peer-score access is invisible to organizers.** The same code logs `eventId: query.eventId`,
   which is usually undefined.
   *Reproduce:* the checker's own probe creates a row with `eventId NULL`, and `/api/events/evt_01/audit`
   never shows it.
   *Fix:* resolve the target judge's event(s) and log one row per event.
10. **Misleading judge flags, and docs that disagree with the code.** `normalization.ts:164,171`: a judge
    with 1 review always has σ = 0, so they are flagged `flat_scorer`, "gave identical scores" in
    `service.ts:1044`, and get z = 0. DATA-MODEL.md says jdg_01 takes the low_sample path.
    *Fix:* check `n < 3` before `σ = 0` (or only flag flat when n ≥ 2), and update JUDGING.md/DATA-MODEL.md
    to match whatever you choose.
11. **The dashboard hides the unfinished review batches.** `under_reviewed` fires only when
    `reviewCount < min(2, K)`. `evt_01` has 8 projects at 2 of 3 reviews, yet the dashboard shows 100%
    complete and no flag. This is spec-compliant but hides exactly what an organizer needs to see.
    *Fix:* add a `below_target` flag (reviewCount < K), and show target coverage next to assignment completion.
12. **Organizer "clear duplicate" is undone by the next submission.** `projects/service.ts:333` recomputes
    `duplicateOfId` for every submitted project in the event.
    *Fix:* persist an organizer override (for example `duplicateCleared`) and have detection respect it.
13. **Teams and projects can be created on unpublished events.**
    `teams/service.ts:92` and `projects/service.ts:174` only check the time window.
    *Reproduce:* create a draft event; `POST /api/events/:id/teams` returns 201.
    *Fix:* require `isVisible(event)`, otherwise 404.

### Low

14. **Submitted project can lose its track.** PATCH `{"trackId":null}` after submitting returns 200 and the
    project stays SUBMITTED (`shared/src/schemas/projects.ts:17`). *Fix:* re-validate the submit
    requirements on edits to SUBMITTED projects.
15. **Weak date validation.** `"1"` and `"2"` are accepted as datetimes (`shared/src/schemas/events.ts:3`).
    *Fix:* `z.string().datetime({ offset: true })`.
16. **Search wildcards not escaped.** `?q=%` matches all rows (`projects/service.ts:96-97`). *Fix:* escape
    `%` and `_`.
17. **`phase` ignores `judgingClose`.** An event whose judging has closed still reports `"judging"`
    (`events/phase.ts:32`). *Fix:* add a "closed" phase or handle it in the UI.
18. **PENDING reviews show `weightedTotal: 0`** in `/api/judge/scores` and the scores CSV
    (`judging/service.ts:823,934`). *Fix:* return null or empty when there are no scores.
19. **Guessable fixture invite codes** (`inv_tm_01`, `seed/index.ts:199`). The closed event blocks joining,
    but preview works and the codes are reset every boot. *Fix:* use random codes, created once.
20. **Login timing leaks whether an email exists.** Unknown emails skip bcrypt (`auth/service.ts:77`).
    *Fix:* compare against a dummy hash.
21. **`X-Powered-By: Express` header**, and Postgres exposed on the host with `postgres/postgres`.
22. **Seed summary prints fixture counts, not imported DB counts** (`seed/index.ts:395-403`), and the
    box is misaligned.
23. **`npm run typecheck` fails on a fresh clone** (`TS2307 Cannot find module '@dogfood/shared'` plus
    knock-on errors). It passes only after `npm run build -w @dogfood/shared`. *Fix:* add TS project
    references or point `types` at `src`.
24. **Organizer UI requires a platform role** (`web/src/pages/organizer/EventManage.tsx:85`). An event-level
    organizer without platform ORGANIZER cannot open the manage page, even though the API allows it.

---

## Code quality — 7 / 10

**Good**
- The layout follows SPEC §3 closely, and the Prisma schema matches SPEC §5 exactly (only `binaryTargets`
  was added).
- Routes are thin, and there is no try/catch in routes (`modules/events/routes.ts`).
- The algorithms are genuinely pure with no DB access (`normalization.ts`, `assignment.ts`, `phase.ts`,
  `duplicates.ts`, `csv.ts`).
- Strict TS with `noUncheckedIndexedAccess` (`tsconfig.base.json`); no `any` and no `@ts-ignore`; the only
  `eslint-disable` is justified (`types/express.ts:18`).
- The deadline check deliberately runs before validation (`projects/service.ts:174-200`). The DB enforces
  one team per user per event (`TeamMember @@unique([eventId, userId])`).
- The deterministic hash tie-break in assignment (`assignment.ts:37-40`) is a thoughtful touch.

**Bad**
- `judging/service.ts` is **1160 lines**, with dashboard, audit, CSV, results, invites and scoring in one file.
  SPEC §3 asks for separate `dashboard/` and `audit/` modules, which don't exist.
- Dead code: `judging/service.ts:746-748` is an empty `if` whose only content is a comment. `:509` is a
  "what" comment. `service.ts:344` has `refreshed ?? updated` after `findUniqueOrThrow`, so the fallback can
  never apply.
- Duplicated logic: `toPublicUser` appears in both `auth/service.ts:19` and `admin/service.ts:7`. The
  "is event organizer" lookup is repeated in `events/service.ts:76`, `judging/service.ts:589,730,836`.
  Normalization input is built three times (`judging/service.ts:851,944,996`). The error-parse block in
  `web/src/api/client.ts` is copy-pasted between `apiRequest` and `apiDownload`.
- Validation happens twice: route `validateBody` plus `schema.parse` again in services
  (`auth/service.ts:46,72`, `projects/service.ts:87`). Projects routes skip `validateBody` entirely and parse
  inside the service.
- Error codes are inconsistent: `bad_request` (validateBody) vs `validation_error` (ZodError) vs
  `incomplete_project` for the same kind of problem. `forbidden` is used as a code for many distinct refusals.
- 15 `req.user!` non-null assertions in services that already checked `req.user` (SPEC §18 says avoid them).
- Casts: `req.query as never` (`projects/routes.ts:12`) and `as unknown as` (`judging/routes.ts:186,252`).
- Multi-row writes run outside transactions: `runDuplicateDetection` and the seed's per-row `update` loops.
- Prisma constraints: nothing stops an Assignment's project belonging to a different event than
  `assignment.eventId`. There are no DB `CHECK`s on weights or score ranges. `AuditLog` cascades on event
  delete, so the audit trail disappears with the event. Expired sessions are never pruned.
- Docker: multi-stage is good, but it uses `npm install` rather than `npm ci` (`Dockerfile:7,28`), so builds
  aren't reproducible. The runtime image installs every workspace's prod deps, including react and
  react-router, which it doesn't need. There is no `HEALTHCHECK` for the app.
- Lint excludes `tests/**` (`eslint.config.js:17`).

---

## Missing tests

The existing suite (10 files, 293 tests, all passing) covers the permission matrix (45 cases × 6 actors),
the deadline, isolation (4 cases), lifecycle, seed idempotency, normalization, assignment, csv, phase and
duplicates. Gaps:

- **Teams API** (listed in SPEC §17 but absent): team full, rotation, leave, and concurrent joins (would
  catch Bug 3).
- **Judging API edge cases**: rubric validation incl. duplicate keys (Bug 6), invite email mismatch and role
  conflict, partial draft save (Bug 5), scoring after publish or judgingClose.
- **Isolation parameter tricks**: array/object `judge[]`, unknown `eventId` (Bug 8), audit row content.
- **Gallery**: search, filters, pagination, unpublished events.
- **Auth**: logout invalidation, expiry, rate limit (and XFF bypass).
- **Input safety**: URL scheme validation (Bug 1), malformed JSON (Bug 7), CSV formula guard end-to-end
  through the export route.
- **Seed**: that a restart *preserves* app-made changes (Bug 4). The current test only compares row counts.
- **Normalization**: n = 1 judge behaviour (Bug 10), a fixture-level regression on the 41 projects.
- **Frontend**: none at all, including the read-only closed-submission form.

---

## Documentation gaps

- README: "createdb is not needed — Docker already has dogfood_test after:" is garbled; the DB must be created
  manually (I did). The fresh-clone typecheck and build-order issue is undocumented. It claims 5433 avoids
  collisions, but 5432 is also bound. It doesn't say to wait for `/api/health` before running `run.py`.
  Otherwise a stranger can run the stack.
- README "Honest limitations" omits the restart overwrite behaviour (Bug 4), the unvalidated URLs, and that
  the fixture event's judging is still **open** (no `judgingClose`, so any fixture judge can change scores
  today).
- DATA-MODEL.md says `jdg_01` takes the low_sample path; the code takes the flat_scorer path (Bug 10).
- JUDGING.md doesn't mention that σ = 0 takes priority over n < 3 (so all 1-review judges are "flat"), or that
  for low-sample judges `normalized = total` (the z round-trips to the raw score).
- ARCHITECTURE.md claims "Zod validate → authorize → handler", but project routes validate inside the
  service, and routes authorize *before* validating (the order is authorize → validate).
- SPEC §3 layout (`dashboard/`, `audit/`, `shared/src/types.ts`, `participant/TeamPage`) differs from the code
  and no "Decisions" entry explains why. `/` is a landing page, not the events list as SPEC §14 says.

---

## Frontend (Step 6)

**NOT VERIFIED in a browser.** No browser automation was available, so the end-to-end T1/T2 click-through,
console errors and live-reload behaviour were not observed. What the code review showed:
- Every page except Home, Login and Register uses the shared loading, error and empty components. Login
  shows its API error inline.
- The project form becomes read-only with a "Submissions closed" message when `phase !== "submissions"`
  (`SubmitProject.tsx:58,137-189`).
- The dashboard polls every 5 s.
- `RequireRole` only gates the UI; every permission it mirrors was proven to be enforced by the backend in
  Step 4/5.
- Only `api/client.ts` calls `fetch`.
- No external URLs in `src/web` (the only hit is the Vite dev proxy to localhost). No fonts or CDNs in
  `index.html` or CSS. The built bundle contains only XML namespace strings and React's error-decoder URL
  as plain strings.

## Offline and security scan (Step 7)

- **URL scan (repo minus node_modules and lockfile):** every hit is localhost config/docs, `example.org`
  fixture data, or `example.com` test data. No runtime external dependencies. Prisma telemetry is the only
  caveat (Risk 5).
- **Secrets:** no `.env` committed (only `.env.example`). The only credentials are demo ones (`dogfood-demo`,
  `postgres/postgres`), which are documented.
- **Debug endpoints:** none.
- **Raw SQL:** only `SELECT 1` in health. Tests use `$executeRawUnsafe` with constant table names.
- **Mass assignment:** none. Services pick fields explicitly.
- **Tokens:** hashed (sessions, judge invites). Team invite codes are stored plain, which is acceptable
  because they're random for app teams.
- **CORS:** no middleware, so it is same-origin only. That's fine.
- **Stack traces:** never returned in responses (500s are `internal_error`), but logged server-side.

---

## Top 10 fixes, in priority order

1. **Clean up the git history story.** Regenerate `acceptance-report.txt` from a real run (after waiting for
   health), commit it normally, rename the `20260325…` migration, and be ready to explain `e51bff9`'s author
   date.
2. **Remove `"5432:5432"` from `docker-compose.yml`** and add an app `healthcheck` (on `/api/health`) so
   `up --wait` works. Set `CHECKPOINT_DISABLE=1`.
3. **Validate `repoUrl` / `demoUrl` as `http(s)` URLs** (Bug 1), and add a UI guard.
4. **Make the seed create-only for existing rows** (Bug 4), so restarts never revert judge scores, organizer
   edits or rotated invite codes.
5. **Drop `trust proxy`** (Bug 2), and add a test that XFF can't bypass the limiter.
6. **Make team join atomic** (Bug 3), and add a concurrency test.
7. **Fix score saving:** only update `comment` when it's sent, and audit edits to submitted reviews correctly
   (Bug 5). Reject duplicate rubric keys (Bug 6).
8. **Fix peer-score audit logging:** no 500 on an unknown event, and attach the real event id so organizers
   see denials (Bugs 8, 9). Map body-parser errors to 400 (Bug 7).
9. **Fix the 1-review judge handling** so they aren't called flat scorers, add a below-target (`< K`) flag to
   the dashboard, and make JUDGING.md/DATA-MODEL.md match the code (Bugs 10, 11).
10. **Fix the fresh-clone typecheck** (Bug 23). Add the missing teams, judging-edge and gallery API tests.
    Split `judging/service.ts` into `dashboard/`, `audit/` and `results` modules as the spec describes.
