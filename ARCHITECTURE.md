# Architecture

## Components

```
┌─────────────────────┐     ┌──────────────────────────────┐
│  Browser (React SPA)│     │  Express app (createApp)     │
│  Vite build → dist  │────▶│  /api/*  + static web/dist   │
│  api/client.ts only │     │                              │
│  place that fetch() │     │  authenticate → routers      │
└─────────────────────┘     │  services → Prisma → Postgres│
                            │  pure libs: phase, assign,   │
                            │  normalize, duplicates, csv  │
                            └──────────────────────────────┘
                                         │
                                         ▼
                                  ┌─────────────┐
                                  │ PostgreSQL  │
                                  │ 16 (Prisma) │
                                  └─────────────┘
```

Workspaces: `@dogfood/shared`, `@dogfood/server`, `@dogfood/web`. Docker multi-stage build
compiles all three and runs `prisma migrate deploy`, seed, then `node dist/index.js`.

## Request lifecycle

1. `express.json` parses the body.
2. `authenticate` optionally loads `User` + `Session` from `Authorization: Bearer <token>`
   (SHA-256 lookup). Expired sessions (vs `clock.now()`) are ignored.
3. Route: Zod validate (`validateBody` / `validateQuery`) → authorize middleware → thin
   handler → service.
4. Services enforce business rules, write `AuditLog` rows via `audit()`, throw `HttpError`.
5. `errorHandler` returns `{ error: { code, message, details? } }`. Non-API GETs fall through
   to the SPA `index.html`.

Routes never contain try/catch; failures propagate to the error middleware.

## Auth and authorization

**Authentication:** bcrypt password hashes; opaque session tokens stored only as hashes.
Demo tokens (when `SEED_DEMO=true`) are fixed strings inserted as sessions at seed time.

**Authorization:**

| Helper | Behaviour |
|---|---|
| `requireAuth` | 401 if no user |
| `requirePlatformRole(...)` | ADMIN always allowed; else role must match |
| `requireEventRole` / `requireAnyEventRole` | ADMIN always allowed; else `EventRole` row |

UI nav hides links by role from `/api/auth/me`, but every permission is re-checked in the
backend. Hiding a button is never the protection.

**Time:** all deadline and phase checks use `clock.now()` and `phase.ts`
(`submissionsOpen`, `judgingOpen`, `phase`). Client clocks are ignored.

## Why these choices

- **Express + Prisma + Postgres** — straightforward CRUD and transactions; enough for
  offline Docker dogfooding without Redis or a message bus.
- **Zod in a shared package** — one contract for server validation and frontend mutation
  payloads.
- **Pure algorithm modules** — assignment and normalization are unit-tested without a DB;
  results are derived on read so rubric weight edits never need score rewrites.
- **Bearer tokens** — simple for curl, `run.py`, and the SPA; acceptable for a local portal.
- **No WebSockets** — dashboard uses HTTP polling (`refetchInterval: 5000`) to stay in the
  allowed stack.

## Decisions

1. **Compute scores on read** — `normalizeScores` runs for results, dashboard, and CSV; nothing
   derived is persisted.
2. **Judge isolation at every endpoint** — `/api/judge/*` returns only the caller’s data unless
   the requester is ADMIN or an event ORGANIZER querying peer scores with the documented rules.
3. **Invite links, not email** — `PUBLIC_URL` + token/path; organizer copies the URL.
4. **One team membership per user per event** — enforced by `TeamMember @@unique([eventId, userId])`.
5. **One project per team** — `Project.teamId @unique`.
6. **Judges cannot be participants** on the same event (`role_conflict` on team join / create).
7. **Duplicate projects** flagged at submit via normalized title/repo; later submission points
   `duplicateOfId` at the earlier one and is excluded from ranking.
8. **CSV formula guard** — cells starting with `= + - @` are prefixed with `'` in `lib/csv.ts`.
9. **Tests use `TEST_DATABASE_URL`** and `clock.setNow` so deadline behaviour is deterministic.
10. **Stack freeze** — no extra UI kits, auth libraries, Redis, or WebSockets (per project rules).
