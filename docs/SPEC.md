# DOGFOOD Portal — Build Specification (T1 + T2)

This is the single source of truth for the build. If code and this file disagree, this file wins.
If something here is ambiguous, choose the simplest option that keeps every rule in section 1, and
write the decision into ARCHITECTURE.md under "Decisions".

---

## 1. Non-negotiable rules (from the hackathon organisers)

1. `docker compose up` starts a fully working, **seeded** portal on `http://localhost:8080`.
2. It runs **fully offline**. No cloud services, no hosted DB, no auth-as-a-service, no CDN links,
   no Google Fonts, no external API calls at runtime. Every asset is bundled.
3. **Every authorization rule is enforced in the backend.** The UI may hide things, but a `curl`
   without permission must get `401` or `403`.
4. `fixtures.json` (repo root) is loaded automatically on first boot.
5. The seed prints four fixed demo tokens on boot; they match `.dogfood.toml`.
6. License is MIT (already in repo). All code lives in `src/`, all tests in `tests/`.
7. Honest behaviour over clever behaviour: no fake data in the UI, no hardcoded results.

---

## 2. Tech stack

| Concern | Choice |
|---|---|
| Language | TypeScript (strict) everywhere |
| Repo | npm workspaces: `src/shared`, `src/server`, `src/web` |
| Backend | Node 20, **Express 5** (native async error handling) |
| Validation | Zod (schemas live in `src/shared` and are reused by the web app) |
| DB | PostgreSQL 16 |
| ORM | Prisma (migrations committed) |
| Passwords | `bcryptjs` (pure JS, no native build in Docker) |
| Sessions | Opaque random tokens, **SHA-256 hashed** in the `Session` table, sent as `Authorization: Bearer <token>` |
| Rate limiting | `express-rate-limit` on auth routes |
| Frontend | React 18 + Vite + React Router 6 + TanStack Query 5 |
| Styling | Tailwind CSS (installed via npm, compiled at build time) |
| Tests | Vitest + Supertest (API), Vitest (pure functions) |
| Lint/format | ESLint (typescript-eslint) + Prettier |
| Runtime | Docker Compose: `db` (postgres:16-alpine) + `app` (one Node process serving API + built React) |

Do **not** add: GraphQL, Redux, a component library, an auth library (Passport, NextAuth, Clerk…),
WebSockets, Redis, microservices, or any SaaS SDK.

---

## 3. Repository layout

```
/
├── docker-compose.yml
├── Dockerfile
├── .dockerignore
├── .dogfood.toml
├── .env.example
├── fixtures.json            (organiser file, do not edit)
├── run.py                   (organiser file, do not edit)
├── acceptance-report.txt    (output of run.py, committed)
├── package.json             (workspaces + root scripts)
├── tsconfig.base.json
├── eslint.config.js  .prettierrc
├── vitest.config.ts
├── README.md  ARCHITECTURE.md  DATA-MODEL.md  JUDGING.md  LICENSE
├── src/
│   ├── shared/src/
│   │   ├── schemas/         zod request/response schemas, one file per module
│   │   ├── types.ts         inferred types re-exported
│   │   └── index.ts
│   ├── server/
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/migrations/
│   │   └── src/
│   │       ├── app.ts               createApp(): builds the Express app, no listen()
│   │       ├── index.ts             starts the server
│   │       ├── config.ts            reads + validates env with zod
│   │       ├── lib/
│   │       │   ├── prisma.ts
│   │       │   ├── clock.ts         now(); overridable in tests
│   │       │   ├── tokens.ts        generate + hash tokens
│   │       │   ├── http-error.ts    HttpError class + helpers (badRequest, forbidden…)
│   │       │   ├── audit.ts         audit(req, action, target, data)
│   │       │   └── csv.ts           toCsv(rows) with escaping + formula-injection guard
│   │       ├── middleware/
│   │       │   ├── authenticate.ts  attaches req.user if a valid token is present
│   │       │   ├── authorize.ts     requireAuth, requirePlatformRole, requireEventRole
│   │       │   ├── validate.ts      validateBody / validateQuery (zod)
│   │       │   └── error-handler.ts
│   │       ├── modules/
│   │       │   ├── auth/        routes.ts service.ts
│   │       │   ├── admin/       routes.ts service.ts
│   │       │   ├── events/      routes.ts service.ts phase.ts
│   │       │   ├── teams/       routes.ts service.ts
│   │       │   ├── projects/    routes.ts service.ts duplicates.ts
│   │       │   ├── judging/     routes.ts service.ts assignment.ts normalization.ts results.ts
│   │       │   ├── dashboard/   routes.ts service.ts
│   │       │   └── audit/       routes.ts service.ts
│   │       └── seed/
│   │           ├── index.ts         idempotent entry point, run on every boot
│   │           └── fixtures.ts      maps fixtures.json → DB
│   └── web/
│       ├── index.html  vite.config.ts  tailwind.config.js
│       └── src/
│           ├── main.tsx  App.tsx (routes only)
│           ├── api/client.ts        single fetch wrapper
│           ├── api/hooks/           one file per module (TanStack Query hooks)
│           ├── auth/AuthContext.tsx  auth/RequireRole.tsx
│           ├── components/          Layout, Nav, Button, Input, Select, Table, Badge, Card,
│           │                        EmptyState, ErrorMessage, Countdown, CopyLink
│           └── pages/
│               ├── public/      Home, EventPage, Gallery, ProjectPage, Results, Login, Register
│               ├── participant/ MyTeams, TeamPage, JoinTeam, SubmitProject
│               ├── organizer/   OrganizerHome, EventForm, EventManage (tabbed)
│               ├── judge/       JudgeHome, ScoreForm, MyScores, AcceptJudgeInvite
│               └── admin/       Users
└── tests/
    ├── helpers/        test app, db reset, token factory, fixed clock
    ├── unit/           normalization, assignment, csv, phase, duplicates
    └── api/            permission matrix, deadline, teams, judging, lifecycle
```

---

## 4. Role model

Two layers, both enforced in middleware/services:

**Platform role** (on `User.platformRole`): `USER` · `ORGANIZER` (may create events) · `ADMIN`
(everything, manages users).

**Event role** (row in `EventRole`, scoped to one event): `ORGANIZER` · `JUDGE` · `PARTICIPANT`.

| Spec role | How it is represented |
|---|---|
| visitor | no token |
| participant | `EventRole(PARTICIPANT)` — granted when a user creates or joins a team |
| judge | `EventRole(JUDGE)` — granted by accepting a judge invite (or by seed) |
| organizer | `EventRole(ORGANIZER)` — granted on event creation (creator) or by seed |
| admin | `User.platformRole = ADMIN`; passes every `requireEventRole` check |

A user can hold several event roles in different events. **Conflict rule:** a user cannot be both
JUDGE and PARTICIPANT in the same event (reject with `409 role_conflict`).

---

## 5. Data model (Prisma)

Use exactly this schema (field names may be refined, relations may not change without updating
DATA-MODEL.md). All ids are strings. Records imported from `fixtures.json` **keep their fixture id**;
records created in the app use `cuid()`.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum PlatformRole {
  USER
  ORGANIZER
  ADMIN
}

enum EventRoleType {
  ORGANIZER
  JUDGE
  PARTICIPANT
}

enum ProjectStatus {
  DRAFT
  SUBMITTED
}

enum AssignmentStatus {
  PENDING
  SUBMITTED
}

model User {
  id           String       @id @default(cuid())
  email        String       @unique
  name         String
  passwordHash String
  platformRole PlatformRole @default(USER)
  createdAt    DateTime     @default(now())

  sessions     Session[]
  eventRoles   EventRole[]
  memberships  TeamMember[]
  assignments  Assignment[]
  judgeTracks  JudgeTrack[]
  auditEntries AuditLog[]
}

model Session {
  id        String   @id @default(cuid())
  tokenHash String   @unique
  userId    String
  createdAt DateTime @default(now())
  expiresAt DateTime
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model Event {
  id                 String    @id @default(cuid())
  name               String
  description        String    @default("")
  submissionsOpen    DateTime
  submissionsClose   DateTime
  judgingClose       DateTime?
  publishedAt        DateTime?
  resultsPublishedAt DateTime?
  maxTeamSize        Int       @default(4)
  reviewsPerProject  Int       @default(3)
  createdAt          DateTime  @default(now())

  tracks       Track[]
  prizes       Prize[]
  roles        EventRole[]
  teams        Team[]
  teamMembers  TeamMember[]
  projects     Project[]
  criteria     Criterion[]
  assignments  Assignment[]
  judgeInvites JudgeInvite[]
  judgeTracks  JudgeTrack[]
  auditEntries AuditLog[]
}

model Track {
  id          String @id @default(cuid())
  eventId     String
  name        String
  description String @default("")
  event       Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)

  prizes      Prize[]
  projects    Project[]
  judgeTracks JudgeTrack[]

  @@unique([eventId, name])
}

model Prize {
  id          String  @id @default(cuid())
  eventId     String
  trackId     String?
  name        String
  description String  @default("")
  value       String  @default("")
  place       Int?
  event       Event   @relation(fields: [eventId], references: [id], onDelete: Cascade)
  track       Track?  @relation(fields: [trackId], references: [id], onDelete: SetNull)

  @@index([eventId])
}

model EventRole {
  id        String        @id @default(cuid())
  userId    String
  eventId   String
  role      EventRoleType
  createdAt DateTime      @default(now())
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  event     Event         @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([userId, eventId, role])
  @@index([eventId, role])
}

model JudgeTrack {
  userId  String
  trackId String
  eventId String
  user    User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  track   Track  @relation(fields: [trackId], references: [id], onDelete: Cascade)
  event   Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@id([userId, trackId])
  @@index([eventId])
}

model JudgeInvite {
  id          String    @id @default(cuid())
  eventId     String
  email       String
  trackIds    String[]
  tokenHash   String    @unique
  createdById String
  createdAt   DateTime  @default(now())
  expiresAt   DateTime
  acceptedAt  DateTime?
  event       Event     @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@index([eventId])
}

model Team {
  id         String   @id @default(cuid())
  eventId    String
  name       String
  inviteCode String   @unique
  createdAt  DateTime @default(now())
  event      Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)

  members TeamMember[]
  project Project?

  @@unique([eventId, name])
}

// eventId is denormalised so the database itself guarantees one team per user per event.
model TeamMember {
  teamId   String
  userId   String
  eventId  String
  joinedAt DateTime @default(now())
  team     Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  event    Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@id([teamId, userId])
  @@unique([eventId, userId])
}

model Project {
  id            String        @id @default(cuid())
  eventId       String
  teamId        String        @unique
  trackId       String?
  title         String
  summary       String        @default("")
  repoUrl       String        @default("")
  demoUrl       String        @default("")
  status        ProjectStatus @default(DRAFT)
  submittedAt   DateTime?
  duplicateOfId String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  event         Event         @relation(fields: [eventId], references: [id], onDelete: Cascade)
  team          Team          @relation(fields: [teamId], references: [id], onDelete: Cascade)
  track         Track?        @relation(fields: [trackId], references: [id], onDelete: SetNull)
  duplicateOf   Project?      @relation("Duplicates", fields: [duplicateOfId], references: [id], onDelete: SetNull)
  duplicates    Project[]     @relation("Duplicates")

  assignments Assignment[]

  @@index([eventId, status])
  @@index([eventId, trackId])
}

model Criterion {
  id          String @id @default(cuid())
  eventId     String
  key         String
  name        String
  description String @default("")
  weight      Int
  minScore    Int    @default(1)
  maxScore    Int    @default(5)
  position    Int
  event       Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)

  scores CriterionScore[]

  @@unique([eventId, key])
}

model Assignment {
  id          String           @id @default(cuid())
  eventId     String
  judgeId     String
  projectId   String
  status      AssignmentStatus @default(PENDING)
  comment     String           @default("")
  submittedAt DateTime?
  createdAt   DateTime         @default(now())
  event       Event            @relation(fields: [eventId], references: [id], onDelete: Cascade)
  judge       User             @relation(fields: [judgeId], references: [id], onDelete: Cascade)
  project     Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)

  scores CriterionScore[]

  @@unique([judgeId, projectId])
  @@index([eventId, status])
  @@index([projectId])
}

model CriterionScore {
  assignmentId String
  criterionId  String
  value        Int
  assignment   Assignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  criterion    Criterion  @relation(fields: [criterionId], references: [id], onDelete: Restrict)

  @@id([assignmentId, criterionId])
}

model AuditLog {
  id         String   @id @default(cuid())
  at         DateTime @default(now())
  actorId    String?
  eventId    String?
  action     String
  targetType String
  targetId   String?
  data       Json?
  ip         String?
  actor      User?    @relation(fields: [actorId], references: [id], onDelete: SetNull)
  event      Event?   @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@index([eventId, at])
}
```

If `fixtures.json` contains non-integer scores, change `CriterionScore.value` to
`Decimal @db.Decimal(4, 2)` and note it in DATA-MODEL.md.

---

## 6. Event phase (single source of truth for time rules)

`src/server/src/modules/events/phase.ts` exports pure functions that take `(event, now)`:

- `isVisible(event)` → `publishedAt !== null`
- `submissionsOpen(event, now)` → `now >= submissionsOpen && now < submissionsClose`
- `judgingOpen(event, now)` → `now >= submissionsClose && resultsPublishedAt === null && (judgingClose === null || now < judgingClose)`
- `phase(event, now)` → `"draft" | "upcoming" | "submissions" | "judging" | "closed" | "results"`
  (`closed` means submissions ended and judging is no longer open — either `judgingClose` has
  passed or an equivalent closed window — and results are not yet published)

Every time-based check in the server uses these functions and `clock.now()`. Never `new Date()`
directly in business logic. The server clock is the only clock; client time is never trusted.

---

## 7. HTTP conventions

- All API routes live under `/api`. Every other path serves the React app (SPA fallback).
  Unknown `/api/*` → `404` JSON.
- JSON only. Dates are ISO 8601 UTC strings.
- Error body, always:
  ```json
  { "error": { "code": "submissions_closed", "message": "Submissions closed at 2026-03-01T18:00:00Z." } }
  ```
  Optional `details` for zod validation issues.
- Status codes: `400` invalid input · `401` no/invalid token · `403` authenticated but not allowed
  or window closed · `404` not found · `409` conflict (duplicate, full team, role conflict).
- Routes are thin: parse → authorize → call service → respond. Business rules live in services.
  Services throw `HttpError`; the error handler formats it. No `try/catch` in routes.
- Every state-changing action writes an `AuditLog` row via `audit()`.

---

## 8. Authentication

- `POST /api/auth/register {email, name, password(min 8)}` → `201 {token, user}`
- `POST /api/auth/login {email, password}` → `200 {token, user}`; wrong credentials → `401 invalid_credentials` (same message for unknown email and wrong password)
- `POST /api/auth/logout` → `204`, deletes the session
- `GET /api/auth/me` → `{ user, roles: [{ eventId, role }] }`
- Tokens: 32 random bytes, base64url. Store only `sha256(token)`. Expiry 7 days.
- `authenticate` middleware reads `Authorization: Bearer <token>`, loads user, sets `req.user`.
  Invalid/expired token → treat as anonymous (then `requireAuth` returns `401`).
- `express-rate-limit`: 10 requests/minute/IP on login and register.
- Frontend stores the token in `localStorage` and sends it via `api/client.ts` only.

**Authorization helpers** (`middleware/authorize.ts`):
- `requireAuth`
- `requirePlatformRole(...roles)`
- `requireEventRole(role, eventIdFrom: (req) => string)` — admin always passes
- Services additionally check ownership (team membership, assignment owner).

---

## 9. API — Tier 1

### Admin
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/admin/users` | ADMIN | list users with platform role |
| PATCH | `/api/admin/users/:userId` | ADMIN | `{platformRole}` |

### Events
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/events` | public | published events; organizers also see their unpublished ones |
| POST | `/api/events` | platform ORGANIZER/ADMIN | body: name, description, submissionsOpen, submissionsClose, judgingClose?, maxTeamSize, reviewsPerProject, tracks[], prizes[]; creator gets EventRole ORGANIZER; validates open < close ≤ judgingClose |
| GET | `/api/events/:eventId` | public if published, else event organizer | includes tracks, prizes, computed `phase` |
| PATCH | `/api/events/:eventId` | event ORGANIZER | same fields as create |
| POST | `/api/events/:eventId/publish` | event ORGANIZER | sets publishedAt |
| POST | `/api/events/:eventId/tracks` | event ORGANIZER | |
| PATCH/DELETE | `/api/events/:eventId/tracks/:trackId` | event ORGANIZER | delete → `409` if projects use it |
| POST | `/api/events/:eventId/prizes` | event ORGANIZER | |
| PATCH/DELETE | `/api/events/:eventId/prizes/:prizeId` | event ORGANIZER | |

### Teams
| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/api/events/:eventId/teams` | auth | `{name}`; submissions must be open (`403 submissions_closed`); user not already in a team for this event (`409 already_in_team`); not a judge of the event (`409 role_conflict`); creates Team + TeamMember + EventRole PARTICIPANT; returns `{team, inviteUrl}` |
| GET | `/api/teams/invite/:code` | public | preview: team name, event name, member count, max size |
| POST | `/api/teams/invite/:code/join` | auth | same checks as create + team full (`409 team_full`) |
| GET | `/api/teams/mine` | auth | my teams with members and project |
| POST | `/api/teams/:teamId/invite/rotate` | team member | new invite code, old one stops working |
| DELETE | `/api/teams/:teamId/members/me` | team member | leave team; only while submissions open |

Invite codes: 16 random bytes, base64url. `inviteUrl = ${PUBLIC_URL}/join/${code}`.

### Projects
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/projects` | **public** | query: `eventId?`, `trackId?`, `q?` (case-insensitive on title + summary), `page=1`, `pageSize=100` (max 100); returns only SUBMITTED projects of published events; default order: `submittedAt asc, id asc`; response `{items, total, page, pageSize}`; items include title, summary, repoUrl, demoUrl, track name, team name |
| GET | `/api/projects/:projectId` | public if SUBMITTED; team members also see DRAFT | never includes scores |
| POST | `/api/projects` | auth | see order of checks below |
| PATCH | `/api/projects/:projectId` | team member | only while submissions open |
| POST | `/api/projects/:projectId/submit` | team member | only while submissions open; requires title, summary, trackId, repoUrl; sets SUBMITTED + submittedAt (first submission only); runs duplicate check |

**`POST /api/projects` order of checks (must be exactly this order):**
1. `requireAuth` → `401`
2. Resolve event: `body.eventId` if present, otherwise the event of the user's only team. If it cannot be resolved → `400 event_required`.
3. **Deadline:** if `!submissionsOpen(event, now)` → `403 submissions_closed`
4. User must be a member of a team in that event → `403 not_a_participant`
5. Team already has a project → `409 project_exists`
6. Validate body with zod → `400`
7. Create DRAFT project.

The deadline check runs before body validation so that a late request is always refused because
it is late. Edits and submits run the same deadline check first.

**Duplicate detection** (`projects/duplicates.ts`, pure function): two projects in the same event are
duplicates if their normalised repo URL matches (lowercase, strip protocol, `www.`, trailing `/` and
`.git`) or their normalised title matches (lowercase, collapse whitespace, strip punctuation). The
later-submitted one gets `duplicateOfId`. Duplicates stay visible in the gallery, are excluded from
judge assignment and ranking, and appear as a flag on the organizer dashboard. An organizer can clear
the flag: `POST /api/projects/:projectId/clear-duplicate` (event ORGANIZER).

---

## 10. API — Tier 2

### Rubric
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/events/:eventId/criteria` | event ORGANIZER or JUDGE | ordered by position |
| PUT | `/api/events/:eventId/criteria` | event ORGANIZER | replaces the full list `{criteria:[{key,name,description,weight,minScore,maxScore}]}`; weights are positive integers summing to **100**; `minScore < maxScore`; removing a criterion that already has scores → `409 criterion_in_use`; weights may change any time because totals are computed at read time |

### Judges
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/events/:eventId/judges` | event ORGANIZER | judges with tracks, assigned count, submitted count |
| POST | `/api/events/:eventId/judges/invites` | event ORGANIZER | `{email, trackIds}` → `{inviteUrl, expiresAt}`; no email is sent (offline) — the organizer copies the link |
| GET | `/api/judge-invites/:token` | public | preview: event name, email |
| POST | `/api/judge-invites/:token/accept` | auth | logged-in email must equal invite email (`403 invite_email_mismatch`); not a participant in the event (`409 role_conflict`); grants EventRole JUDGE + JudgeTrack rows |
| PUT | `/api/events/:eventId/judges/:userId/tracks` | event ORGANIZER | `{trackIds}` |
| DELETE | `/api/events/:eventId/judges/:userId` | event ORGANIZER | `409` if the judge has submitted scores; otherwise removes role + pending assignments |

### Assignments
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/events/:eventId/assignments` | event ORGANIZER | all assignments with status |
| POST | `/api/events/:eventId/assignments/auto` | event ORGANIZER | runs the algorithm in section 11; idempotent; returns `{created, unassignable:[{projectId, reason}]}` |
| POST | `/api/events/:eventId/assignments` | event ORGANIZER | manual `{judgeId, projectId}`; same conflict rules |
| DELETE | `/api/assignments/:assignmentId` | event ORGANIZER | only PENDING |

### Judge workspace
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/judge/assignments` | auth + JUDGE in ≥1 event | **own assignments only**; query `eventId?`; includes project, own scores, status; never other judges' data |
| GET | `/api/judge/assignments/:assignmentId` | owner only | not owner → `403` |
| PUT | `/api/judge/assignments/:assignmentId/scores` | owner only | `{scores:{[criterionKey]: int}, comment, submit: boolean}`; judging must be open (`403 judging_closed`); every value within the criterion range; when `submit` is true all criteria are required; sets SUBMITTED + submittedAt; a SUBMITTED review can still be edited while judging is open (audited) |
| GET | `/api/judge/scores` | see rules | **the isolation endpoint** |

**`GET /api/judge/scores` rules (the acceptance checker tests this):**
- query params: `judge?` (user id), `eventId?`
- no token → `401`
- `judge` present and `judge !== req.user.id`:
  - allowed only if the requester is ADMIN or an ORGANIZER of the event(s) being queried
    (require `eventId` for organizers; if missing, restrict to events they organize)
  - otherwise → `403 forbidden` with message "Judges can only view their own scores."
- `judge` absent: the requester must hold JUDGE in at least one event, otherwise `403 not_a_judge`
  → returns the requester's own scores
- response: `{ items: [{ assignmentId, eventId, projectId, projectTitle, status, comment, scores: {key: value}, weightedTotal, submittedAt }] }`

Isolation holds everywhere, not only here: no endpoint available to a judge returns another
judge's scores, comments, or completion status. Results are organizer-only until published, and the
public results never contain per-judge data.

### Results, dashboard, export, audit
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/events/:eventId/results` | event ORGANIZER always; **public only after resultsPublishedAt** | see section 12; the public version omits per-judge data and flags |
| POST | `/api/events/:eventId/results/publish` | event ORGANIZER | sets resultsPublishedAt; closes judging |
| POST | `/api/events/:eventId/results/unpublish` | event ORGANIZER | clears it |
| GET | `/api/events/:eventId/dashboard` | event ORGANIZER | polled every 5 s by the UI |
| GET | `/api/events/:eventId/export.csv` | event ORGANIZER | `?type=results` (default) or `?type=scores`; `Content-Type: text/csv; charset=utf-8`; `Content-Disposition: attachment` |
| GET | `/api/events/:eventId/audit` | event ORGANIZER | paginated, newest first, human-readable `summary` per row |

**Dashboard response:**
```json
{
  "generatedAt": "…",
  "totals": { "projects": 40, "assignments": 120, "submitted": 97, "pending": 23, "percentComplete": 80.8 },
  "judges": [{ "id": "jdg_01", "name": "…", "assigned": 4, "submitted": 4, "flatScorer": false }],
  "projects": [{ "id": "prj_01", "title": "…", "track": "…", "assigned": 3, "submitted": 2 }],
  "flags": [{ "type": "flat_scorer|under_reviewed|duplicate|unassigned", "targetId": "…", "message": "…" }]
}
```

**CSV `type=results` header (exact):**
`rank,track,project_id,title,team,review_count,raw_score,normalized_score,flags` followed by one
`avg_<criterionKey>` column per criterion.
**CSV `type=scores` header (exact):**
`judge_id,judge_name,project_id,title,status,<criterionKey…>,weighted_total,comment,submitted_at`.
`lib/csv.ts` quotes every field that contains `,` `"` or a newline, doubles embedded quotes, and
prefixes cells starting with `= + - @` with `'` to prevent spreadsheet formula injection.

**Audit actions to record (minimum):** `auth.login`, `auth.register`, `event.create`,
`event.update`, `event.publish`, `track.*`, `prize.*`, `team.create`, `team.join`, `team.leave`,
`team.invite_rotate`, `project.create`, `project.update`, `project.submit`,
`project.submit_refused_deadline`, `rubric.update`, `judge.invite`, `judge.accept`, `judge.remove`,
`assignment.auto`, `assignment.create`, `assignment.delete`, `score.save`, `score.submit`,
`score.edit_after_submit`, `results.publish`, `results.unpublish`, `export.csv`,
`access.denied_peer_scores`.

---

## 11. Assignment algorithm (`judging/assignment.ts`, pure function)

Input: submitted non-duplicate projects, judges with tracks, team member emails, existing
assignments, `reviewsPerProject` (K). Output: new assignments + unassignable list.

1. Process projects in ascending order of current assignment count, then by id.
2. Eligible judges for a project: JUDGE in the event, **not a member of the project's team**
   (conflict of interest, compared by user id and email), not already assigned to it.
3. Prefer judges whose tracks include the project's track. If fewer than needed, fall back to any
   eligible judge and mark the assignment `trackFallback` in the result.
4. Pick the eligible judge with the lowest current load; tie-break by a stable hash of
   `(projectId, judgeId)` so results are deterministic and not always alphabetical.
5. Repeat until the project has K assignments or no eligible judges remain (→ unassignable, with reason).
6. Never delete or change existing assignments.

---

## 12. Scoring and normalization (`judging/normalization.ts`, pure function)

For one event:

1. **Weighted total** of a submitted review, on the rubric scale:
   `total = Σ(value_c × weight_c) / Σ(weight_c)` over the criteria present in the review.
   Reviews missing criteria are marked `partial`.
2. **Per-judge statistics** over that judge's submitted reviews in this event: mean `μ_j`,
   population standard deviation `σ_j`, count `n_j`.
3. **z-score** per review: `z = (total − μ_j) / σ_j`.
4. **Fallbacks (documented in JUDGING.md):**
   - `σ_j = 0` (a judge who gave every project the same score): the judge carries no ranking
     information → `z = 0` for all their reviews and the judge is flagged `flat_scorer`.
   - `n_j < 3`: too few reviews to estimate spread → `z = (total − μ_global) / σ_global` using
     all submitted reviews in the event, and flag the judge `low_sample`.
5. **Rescale** back to the rubric scale so organizers can read it:
   `normalized = μ_global + z × σ_global`, clamped to `[minScore, maxScore]`.
6. **Project scores:** `raw_score` = mean of totals; `normalized_score` = mean of normalized values;
   `review_count` = number of submitted reviews.
7. **Flags per project:** `under_reviewed` if `review_count < min(2, reviewsPerProject)`;
   `duplicate` if `duplicateOfId` is set (excluded from ranking).
8. **Ranking:** per track, by `normalized_score` desc, then `raw_score` desc, then `review_count`
   desc, then id. Projects with zero reviews are listed unranked at the end.
9. Results always show raw and normalized side by side, plus the review count.

Round only for display (2 decimals). Store nothing derived: results are computed on read.

---

## 13. Seed (`src/server/src/seed`)

Runs on every container start after `prisma migrate deploy`. **Idempotent**: upserts by id, never
duplicates rows.

1. **Read `fixtures.json` first and inspect its real keys.** Map every key you find. If the file
   contains keys not described here (e.g. assignments or batches), import them into the matching
   table. Never silently drop data; document the mapping in DATA-MODEL.md.
2. Event: keep fixture id; `submissionsClose` from fixture; `submissionsOpen` = earliest project
   `submitted_at` minus 7 days (or fixture value if present); `publishedAt` = seed time.
3. Tracks, judges, teams, projects keep fixture ids. Users are created from judge emails and team
   member emails (deduplicated by email). Projects with `submitted_at` are SUBMITTED.
4. Criteria: one per distinct key found in `scores[].criteria`, equal integer weights summing to 100
   (remainder to the first), min/max inferred from the data (default 1–5).
5. Each fixture score row becomes a SUBMITTED Assignment with CriterionScores. Missing score rows
   stay missing — do not invent them.
6. Run duplicate detection over the imported projects.
7. Demo accounts (password `dogfood-demo` for all, printed on boot):
   - `admin@dogfood.local` (ADMIN)
   - `organizer@dogfood.local` (platform ORGANIZER + event ORGANIZER of the fixture event)
   - judge A = the fixture's first judge, judge B = the fixture's second judge
   - participant = the first team member of the first team who is not a judge
8. Create four sessions with fixed tokens (store their hashes, expiry 1 year):
   `demo-organizer-token`, `demo-judge-a-token`, `demo-judge-b-token`, `demo-participant-token`.
   Only when `SEED_DEMO=true` (default in docker-compose). README must say to set it to `false`
   in production.
9. Also seed a second event, **"Demo Open Hack"** (`id: evt_demo`), with submissions open for the
   next 7 days, 2 tracks, and a 3-criterion rubric (functionality 40, design 30, impact 30), owned
   by the demo organizer. This is used for the live demo video. The fixture event stays untouched.
10. Print a boxed summary on boot: URL, demo accounts, the four tokens, fixture counts imported.

---

## 14. Frontend

**Design rules — simple and consistent:**
- Tailwind only. White background, slate text, one accent colour (indigo-600), `max-w-5xl mx-auto px-4`.
- System font stack. No external fonts, icons, or images from the internet.
- Plain tables for lists, one-column forms with labels, one primary button per screen.
- Every page handles loading, empty, and error states using the shared components.
- Dates shown in the user's local time with the UTC time in a tooltip.
- Mobile friendly: nothing wider than the screen; tables scroll horizontally inside their card.
- Accessible: every input has a label, buttons are `<button>`, focus styles visible.

**Nav** (shows items by role from `/api/auth/me`): Events · Gallery · My teams (participant) ·
Judging (judge) · Organize (organizer) · Admin (admin) · Login/Logout.

**Pages and routes:**

| Route | Page | Who |
|---|---|---|
| `/` | Events list (cards: name, phase badge, dates) | public |
| `/events/:eventId` | Event detail: description, dates with countdown to deadline, tracks, prizes, buttons "Gallery", "Create team", "Results" (when published) | public |
| `/gallery` | Gallery: search box, event select, track select, project cards; state kept in the URL query | public |
| `/projects/:projectId` | Project detail | public |
| `/events/:eventId/results` | Published results by track | public after publish |
| `/login` `/register` | Auth forms; redirect back after login | public |
| `/teams` | My teams: members, invite link with copy button, project status | participant |
| `/events/:eventId/team/new` | Create team form | auth |
| `/join/:code` | Join team preview + confirm | auth |
| `/teams/:teamId/project` | Project form: save draft, submit, edit; when closed, form is read-only with a clear "Submissions closed" message | team member |
| `/organize` | My events + "New event" | organizer |
| `/organize/new` | Event form incl. tracks and prizes | platform organizer |
| `/organize/:eventId` | Tabs: **Settings** (event, tracks, prizes, publish) · **Rubric** (criteria rows, live weight sum must equal 100) · **Judges** (invite form → copyable link, list, tracks) · **Assignments** (auto-assign button, table, unassignable list) · **Dashboard** (live, refetch every 5 s, progress bars, flags) · **Results** (raw vs normalized, review count, flags, publish/unpublish, CSV buttons) · **Audit log** | event organizer |
| `/judge` | My assignments grouped by event, progress count | judge |
| `/judge/assignments/:assignmentId` | Score form: project info, one input per criterion (range + description), comment, "Save draft" and "Submit" | assignment owner |
| `/judge/scores` | My submitted scores | judge |
| `/judge-invite/:token` | Accept judge invite | auth |
| `/admin` | Users table, change platform role | admin |

`api/client.ts` is the only place that calls `fetch`: adds the Bearer token, parses the error shape,
throws a typed `ApiError`, and clears the token on `401`.

---

## 15. Docker

- `Dockerfile` multi-stage: install workspaces → build shared, server, web → slim runtime image with
  production deps, Prisma client, compiled server, `web/dist`, `fixtures.json`.
- Container command: `prisma migrate deploy && node dist/seed/index.js && node dist/index.js`.
- `docker-compose.yml`:
  - `db`: `postgres:16-alpine`, named volume, healthcheck `pg_isready`.
  - `app`: builds the Dockerfile, `depends_on: db (service_healthy)`, `ports: "8080:8080"`,
    env `DATABASE_URL`, `PORT=8080`, `PUBLIC_URL=http://localhost:8080`, `SEED_DEMO=true`.
- Express serves `web/dist` statically, with SPA fallback for non-`/api` GET requests.
- `GET /api/health` → `{status:"ok"}` (checks DB).
- No runtime network access is required after the images are built.

---

## 16. `.dogfood.toml`

```toml
[portal]
base_url = "http://localhost:8080"

[tiers]
claimed = ["T1", "T2"]
pitch = "A self-hosted hackathon portal with weighted rubrics, documented cross-judge normalization and backend-enforced judge isolation."

[auth]
organizer   = "Authorization: Bearer demo-organizer-token"
judge_a     = "Authorization: Bearer demo-judge-a-token"
judge_b     = "Authorization: Bearer demo-judge-b-token"
participant = "Authorization: Bearer demo-participant-token"

[routes]
gallery      = "/api/projects"
submit       = "/api/projects"
judge_scores = "/api/judge/scores"
peer_scores  = "/api/judge/scores?judge=<FIRST_FIXTURE_JUDGE_ID>"
csv_export   = "/api/events/<FIXTURE_EVENT_ID>/export.csv"
```
Replace the two placeholders with the real ids from `fixtures.json`.

---

## 17. Tests (`tests/`)

Run with `npm test` against a separate database (`TEST_DATABASE_URL`), reset before each file.

- **unit/normalization** — flat judge gets z = 0 and a flag; judge with < 3 reviews uses global
  stats; uneven review counts (2 vs 5) handled; weights change totals; clamping; empty input.
- **unit/assignment** — never assigns a team member; respects K; balances load (max − min ≤ 1 when
  possible); track preference with fallback; idempotent; deterministic.
- **unit/csv** — escaping and formula-injection guard.
- **unit/phase** and **unit/duplicates**.
- **api/permission-matrix** — table-driven: every protected endpoint × {anonymous, participant,
  judge A, judge B, organizer, admin} → expected status. This is the most important test file.
- **api/deadline** — with the clock set after the deadline: create, edit, submit, create team, join
  team all return `403 submissions_closed`; before the deadline they succeed.
- **api/judge-isolation** — judge B gets `403` for judge A's scores, assignments, and assignment
  detail; organizer gets `200`.
- **api/lifecycle** — full flow through the API: create event → rubric → team → invite → join →
  draft → submit → judge invite → accept → auto-assign → score → dashboard → results → CSV → publish
  → public results.
- **api/seed** — running the seed twice produces the same row counts.

---

## 18. Code quality rules

- TypeScript strict, no `any`, no `@ts-ignore`, no non-null assertions without a reason.
- Small modules; one responsibility per file. Pure functions for algorithms (no DB access inside
  `normalization.ts`, `assignment.ts`, `phase.ts`, `duplicates.ts`, `csv.ts`).
- Names describe intent (`submissionsOpen`, not `check2`). No abbreviations except `id`, `url`.
- Comments explain **why**, never **what**. No commented-out code, no TODO/FIXME left behind, no
  banner or decorative comments, no JSDoc on self-explanatory functions.
- No dead code, no unused exports, no console.log except the seed summary and server start line.
- All config through `config.ts` (zod-validated env). No magic numbers: name them as constants.
- Prisma queries select only needed fields; use transactions for multi-row writes.
- ESLint and Prettier pass with zero warnings. `npm run typecheck` passes.

---

## 19. Required documentation (written last, from the real code)

- **README.md** — what it is, one-command start, demo accounts and tokens, how to run `run.py`,
  how to run tests, feature list by tier, **honest limitations and known gaps**, production notes
  (`SEED_DEMO=false`, change passwords, backups).
- **ARCHITECTURE.md** — component diagram (ASCII), request lifecycle, auth and authorization design,
  why these choices, "Decisions" list.
- **DATA-MODEL.md** — every table and why it exists, key constraints (e.g. one team per user per
  event enforced by a unique index), fixture mapping, import and export paths.
- **JUDGING.md** — assignment strategy, weighted totals, normalization math with a worked example,
  every fallback and why it is defensible, how isolation is enforced (list of endpoints and checks),
  limitations.
- **acceptance-report.txt** — `python run.py .dogfood.toml > acceptance-report.txt`, committed as is.
