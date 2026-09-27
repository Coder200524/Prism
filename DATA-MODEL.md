# Data model

Prisma schema: `src/server/prisma/schema.prisma`. Postgres 16.

## Tables

| Table | Why it exists |
|---|---|
| **User** | Accounts: email, bcrypt `passwordHash`, `platformRole` (`USER` / `ORGANIZER` / `ADMIN`). |
| **Session** | Bearer auth. Stores `tokenHash` (SHA-256 of the opaque token) and `expiresAt`. |
| **Event** | Hackathon container: submission/judging windows, publish flags, `maxTeamSize`, `reviewsPerProject`. |
| **Track** | Per-event category for projects and judge preferences. Unique name per event. |
| **Prize** | Optional awards; may reference a track. |
| **EventRole** | Per-event role grant: `ORGANIZER`, `JUDGE`, or `PARTICIPANT`. Unique `(userId, eventId, role)`. |
| **JudgeTrack** | Preferred tracks for a judge in an event. Composite id `(userId, trackId)`. |
| **JudgeInvite** | Pending judge invites: email, `trackIds[]`, hashed token, expiry, optional `acceptedAt`. |
| **Team** | Named team in an event with unique `inviteCode`. Unique `(eventId, name)`. |
| **TeamMember** | Membership. `eventId` is denormalised so **one team per user per event** is a DB unique on `(eventId, userId)`. |
| **Project** | Team submission (draft/submitted). **One project per team** (`teamId` unique). Optional `duplicateOfId`. |
| **Criterion** | Rubric row: `key`, weights, min/max, position. Unique `(eventId, key)`. |
| **Assignment** | Judge ↔ project review slot. Unique `(judgeId, projectId)`. Status `PENDING` / `SUBMITTED`. |
| **CriterionScore** | Integer score for one criterion on one assignment. PK `(assignmentId, criterionId)`. |
| **AuditLog** | Append-only trail of state changes (`action`, actor, event, target, JSON `data`). |
| **Vote** | Community vote. Unique `(eventId, voterId, trackId)`. `ipHash` prevents storing raw PII. |
| **Comment** | Community comment on a project. |
| **ApiKey** | Machine access token for organizers (`prefix`, SHA-256 `keyHash`, `scopes[]`, optional `eventId`). |

## Important constraints

- `TeamMember @@unique([eventId, userId])` — cannot join two teams in the same event.
- `Project.teamId @unique` — cannot create a second project for a team.
- `Assignment @@unique([judgeId, projectId])` — one review slot per judge/project pair.
- `Vote @@unique([eventId, voterId, trackId])` — one vote per voter per track.
- IP addresses in `Vote.ipHash` are hashed to avoid storing plain PII.
- `Criterion` delete is restricted while `CriterionScore` rows exist (`onDelete: Restrict`).
- Removing a criterion that already has scores returns `409 criterion_in_use`.
- `Comment` moderation uses `hiddenAt` for soft deletes to preserve the audit trail.

## Fixture mapping

Source file: `fixtures.json` (organiser-owned; do not edit).

### Top-level keys

| Fixture key | DB mapping |
|---|---|
| `event` | `Event` (`id` preserved). `submissions_close` → `submissionsClose`. `submissionsOpen` = earliest project `submitted_at` − 7 days (fixture has no `submissions_open`). `publishedAt` = seed time. |
| `tracks[]` | `Track` (`id` preserved). Fields: `id`, `name`. |
| `judges[]` | `User` (`id` preserved) + `EventRole(JUDGE)` + `JudgeTrack` rows from `tracks`. Fields: `id`, `name`, `email`, `tracks`. |
| `teams[]` | `Team` (`id` preserved, `inviteCode` = `inv_<teamId>`) + `User` per member email + `EventRole(PARTICIPANT)` + `TeamMember`. Fields: `id`, `name`, `members[]`. Fixture reuses names (`StillTrail`×3, `AmberSwitch`×2, `OpenSignal`×2); seed keeps the first as-is and suffixes later collisions with ` (tm_xx)` for `@@unique([eventId, name])`. |
| `projects[]` | `Project` (`id` preserved). `team` → `teamId`, `track` → `trackId`, `repo_url` → `repoUrl`, `submitted_at` → `submittedAt` + status `SUBMITTED`. |
| `scores[]` | `Assignment` (`id` = `asgn_<judge>_<project>`, status `SUBMITTED`) + `CriterionScore` per criteria key. Fields: `judge`, `project`, `criteria`, `comment`. No separate assignments/batches keys exist. |

### Derived data

- **Criteria** — distinct keys from `scores[].criteria` (`functionality`, `quality`, `innovation`), equal integer weights summing to 100 (34/33/33), min/max inferred from score values (2–5).
- **Duplicate project** — `prj_07` and `prj_41` share title `Dry Harbour` and repo `https://example.org/repo/07`. Later submission `prj_41` gets `duplicateOfId = prj_07`.
- **Same-team conflict** — both projects reference `tm_07`, but `Project.teamId` is unique. Seed places `prj_41` on synthetic team `tm_dup_prj_41` named `CopperLedger (duplicate entry)` with no members (original members stay on `tm_07`).
- **Flat-scoring judge** — `jdg_07` submitted 3 reviews with every criterion value `4` (σ = 0 → `flat_scorer` in normalization). `jdg_01` is also constant-valued but has only 1 review (`low_sample` path).
- **Unfinished judging (no batches key)** — fixtures have no `batches` array. Incomplete judging is represented by projects with fewer than `reviewsPerProject` (3) submitted score rows: `prj_10`, `prj_15`, `prj_18`, `prj_19`, `prj_24`, `prj_29`, `prj_39`, `prj_40` (2 reviews each). Missing score rows are not invented.
- **Demo Open Hack** — separate event `evt_demo` (not from fixtures), 2 tracks, rubric weights 40/30/30, owned by `organizer@dogfood.local`.

### Counts (must match seed summary)

| Entity | Count |
|---|---|
| tracks | 8 |
| judges | 30 |
| teams | 40 (+ 1 synthetic for duplicate project) |
| projects | 41 |
| scores → assignments | 126 |
| criteria (fixture event) | 3 |
| flagged duplicates | 1 (`prj_41`) |

## Import and export paths

| Path | Direction | Notes |
|---|---|---|
| `fixtures.json` → `runSeed()` | Import | Idempotent upserts; run on container start |
| `GET /api/events/:id/export.csv?type=results` | Export | Ranked projects + criterion averages |
| `GET /api/events/:id/export.csv?type=scores` | Export | Per-assignment criterion values + weighted total |
| Gallery `GET /api/projects` | Public read | Submitted projects of published events only |

Seed entrypoint: `src/server/src/seed/index.ts` (`runSeed`). CSV builder: `src/server/src/lib/csv.ts`.
