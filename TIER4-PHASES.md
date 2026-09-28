# Tier 4 build: Antigravity prompts, one phase at a time (HISTORICAL)

> **Historical T4 build playbook.** T4 features are implemented in the current codebase
> (API keys, OpenAPI, import/export, records/certificates, embed gallery, webhooks).
> This file is retained as a construction log, not as current status.
> `run.py` does **not** verify T4.

**Branch:** `tier-4`, created from `main` **after `tier-3` is merged** (the tier ladder only counts T4
if T3 is complete).
**Tier 3:** use `TIER3-PHASES.md`. Those prompts work in Antigravity unchanged. Don't run T3 twice
if Arisha is already doing it.
**Hard cutoff for T4:** Monday 28 Sep, 15:00 IST. Anything unfinished is left unclaimed.

## What the judges asked for (T4 STRETCH, from the official brief)

1. REST API and webhooks
2. Certificate and record generation
3. Signed, publicly verifiable judge participation records
4. Embeddable gallery widget
5. Bulk import and export

Plus the **"API First" bonus**: a documented REST API with an OpenAPI spec (Phase 1 covers it).

## How to use this file

1. Open the repo in Antigravity (agent mode, strongest model). The agent reads `AGENTS.md`
   automatically; every prompt also tells it to.
2. Paste **one phase per new chat**. Check "Done when" yourself before the next phase.
3. If a check fails, paste the error back: "This failed: … Fix only this."
4. Never merge into main; open a PR at the end.

**Build order is by value:** if time runs out, stop after any phase, and what's finished is still
useful (and honestly documented), but don't claim T4 unless all 5 items are done.

---

## Phase 0: Branch and baseline

```
Read AGENTS.md fully and follow it for all work in this session.

1. git checkout main && git pull
2. Confirm tier-3 has been merged (git log --oneline -15 should show it). If not, stop and tell me.
3. git checkout -b tier-4
4. Run the verification gate from AGENTS.md section 14 and report the real output:
   npm run typecheck, npm run lint, npm test, docker compose down -v,
   docker compose up -d --build --wait, python run.py .dogfood.toml
5. Report the test count (this is the baseline; it may never go down) and confirm 7/7 PASS.
Do not change code.
```
**Done when:** you're on `tier-4`, the tests pass, run.py shows 7/7, and you've noted the test count.

---

## Phase 1: REST API foundation, API keys, OpenAPI (also the API First bonus)

```
Read AGENTS.md, docs/SPEC.md and the existing routes in src/server/src/modules. We are adding
Tier 4. Global rules for every T4 phase:
- T1, T2 and T3 behaviour must not change: no changes to existing endpoint paths, methods,
  response shapes, or existing tests (only additions).
- Never edit run.py, fixtures.json, LICENSE or the [auth]/[routes] of .dogfood.toml.
- Offline: no CDN, no external calls at runtime. All assets come from npm.
- Thin routes, logic in services, pure functions for rules, zod in src/shared, standard error shape,
  audit() on every state change, no `any`, comments explain why only.
- Every new endpoint gets success + refusal tests and is added to the permission matrix.

Build:
1. API keys for organizers (machine access to the same REST API):
   - Prisma model ApiKey: id, eventId (nullable = all events the owner organizes), ownerId, name,
     prefix (first 8 chars, shown in the UI), keyHash (sha256, unique), scopes String[]
     (read, write), createdAt, lastUsedAt, revokedAt. New migration with the current timestamp.
   - Key format: "dfk_" + 32 random bytes base64url. Shown ONCE on creation, never again.
   - authenticate middleware: accept "Authorization: Bearer dfk_..." in addition to session tokens.
     An API key acts as its owner but is limited to its scopes (read = GET only) and its eventId.
     Revoked or unknown → 401. Session auth must behave exactly as before.
   - Endpoints (event ORGANIZER or admin): POST /api/events/:eventId/api-keys,
     GET /api/events/:eventId/api-keys (never returns hashes), DELETE /api/api-keys/:id (revoke).
   - Audit: api_key.create, api_key.revoke. Rate limit API-key requests: 120/min per key.
2. OpenAPI 3.1:
   - Generate the spec from the shared zod schemas (use @asteasolutions/zod-to-openapi) with every
     existing and new /api route: path, method, auth requirement (session or API key), request body,
     responses including the error shape and the 401/403/404/409/429 cases.
   - Serve it at GET /api/openapi.json (public).
   - Serve Swagger UI at /api/docs using the swagger-ui-dist npm package, bundled locally. It must
     work under our strict CSP: load the initializer from a static .js file, not an inline script.
   - A test that walks the Express router and fails if any /api route is missing from the OpenAPI spec.
3. docs/API.md: authentication (sessions vs API keys, scopes), pagination, errors, rate limits,
   versioning policy (additive changes only), and 3 curl examples.

Run the full gate: test count ≥ baseline, run.py 7/7.
git add . ; git commit -m "feat(t4): API keys, OpenAPI spec and docs" ; git push -u origin tier-4
```
**Done when:** `/api/docs` loads offline, a read key can GET but gets 403 on POST, a revoked key gets 401, the route-coverage test passes, and run.py shows 7/7.

---

## Phase 2: Bulk import and export

```
Read AGENTS.md and DATA-MODEL.md (especially the fixture mapping). Same global rules as Phase 1.
Build a module src/server/src/modules/transfer/ (export.service.ts, import.service.ts, routes.ts).

1. Export (event ORGANIZER or admin, audited export.*):
   - GET /api/events/:eventId/export.json: the full event in a documented, versioned format
     { format: "dogfood-event", version: 1, exportedAt, event, tracks, prizes, criteria, judges,
     teams (members by email), projects, assignments, scores, votes (T3; voter ids pseudonymised),
     comments }. Never include password hashes, session or API-key data, raw IPs, or emails of voters.
   - Its top-level keys must stay compatible with fixtures.json (event, tracks, judges, teams,
     projects, scores), so an export can be re-imported by our own importer AND read as fixtures.
   - Existing CSV exports stay untouched. Add GET /api/events/:eventId/export/projects.csv and
     /export/judges.csv using lib/csv.ts.
2. Import (platform ORGANIZER or admin, audited import.*):
   - POST /api/import?dryRun=true|false, body = a fixtures.json-shaped document or our export format.
   - Validate everything with zod first. The dry run returns a report: counts to create, rows
     skipped as already existing (matched by id, or email for users), and errors with the JSON path.
   - A real run applies it in ONE transaction; any error rolls back everything. Idempotent:
     importing the same file twice creates nothing the second time. Never overwrites existing rows.
   - Imported users get an unusable random password (they sign in after an organizer resets it);
     document this.
   - The importing organizer becomes ORGANIZER of the imported event.
   - Body size limit 10 MB → 413 with our error shape.
   - CSV import: POST /api/events/:eventId/import/judges.csv (columns email,name,tracks) creates
     judge invites (the same flow as the Judges tab), with a dry-run report too.
3. Tests: round trip (export evt_01 → import into a fresh DB → the same counts); fixtures.json itself
   imports; dry run writes nothing; a malformed file gives a precise error path; idempotency;
   a mid-import failure rolls back; permissions; secrets never appear in the export.
4. DATA-MODEL.md: add an "Import and export paths" section describing both formats. This is required
   by the brief ("migration path in and out").

Full gate. git add . ; git commit -m "feat(t4): bulk import and export" ; git push
```
**Done when:** round-trip and idempotency tests pass, the export contains no secrets, and run.py shows 7/7.

---

## Phase 3: Signed, publicly verifiable judge participation records

```
Read AGENTS.md and JUDGING.md. Same global rules. Module src/server/src/modules/records/.

1. Signing key:
   - Ed25519 via node:crypto (no external crypto library). On first boot, generate a keypair and
     store it in a SigningKey table (id/kid, publicKey PEM, privateKey PEM encrypted with AES-256-GCM
     using the SIGNING_KEY_SECRET env var, createdAt, retiredAt). If SIGNING_KEY_SECRET is missing
     in production mode, refuse to start with a clear message; docker-compose sets a demo value, and
     the README says to change it.
   - Support key rotation: new records use the active key; old records stay verifiable with their kid.
2. Record model: Record { id, type ("judge_participation" | "participant_certificate" |
   "judge_certificate"), eventId, subjectUserId, payload Json, payloadHash, signature, kid,
   issuedAt, revokedAt, revokedReason }.
3. Judge participation payload (NO scores or comments, to protect isolation): record id, type, event id
   and name, judge display name, number of submitted reviews, first and last review dates, issuer
   ("DOGFOOD portal at <PUBLIC_URL>"), issuedAt.
   Sign the canonical JSON (keys sorted recursively, no whitespace, UTF-8). Document the
   canonicalisation exactly.
4. Issuing: when results are published, issue one record per judge with at least 1 submitted review
   (idempotent: never duplicates). An organizer can also issue or revoke manually:
   POST /api/events/:eventId/records/issue, POST /api/records/:id/revoke {reason}. Audited.
5. Public verification (no auth):
   - GET /api/records/:id → { record payload, signature, kid, revoked }
   - GET /api/records/keys → all public keys with kid (JWKS-style)
   - POST /api/records/verify → body { payload, signature, kid } → { valid, revoked, reason }
   - A judge can list their own records: GET /api/me/records.
6. Offline verification tool: tools/verify-record.mjs (Node standard library only). Usage:
   node tools/verify-record.mjs record.json public-keys.json → prints VALID or INVALID with the reason.
7. Tests: sign/verify round trip; a tampered payload → invalid; the wrong kid → invalid; revoked →
   reported; key rotation keeps old records valid; canonicalisation is stable regardless of key order;
   issuing is idempotent; payload contains no scores; permissions.
8. JUDGING.md: add "Verifiable judge records" (what is signed, why no scores, how to verify
   independently, key rotation, revocation). THREAT-MODEL.md: add forged or altered records.

Full gate. git add . ; git commit -m "feat(t4): signed verifiable judge records" ; git push
```
**Done when:** the verify tool says VALID for a real record and INVALID after editing one character, the tests pass, and run.py shows 7/7.

---

## Phase 4: Certificates and record generation

```
Read AGENTS.md and the records module from Phase 3. Same global rules.

1. Certificates are signed records (reuse Phase 3) rendered as printable pages:
   - participant_certificate: participant name, team, project title, event, track, and placement if
     results are published (e.g. "1st place — Developer tools"), issuedAt.
   - judge_certificate: judge name, event, number of projects reviewed.
   Issued automatically when results are published (idempotent), for every member of a team with a
   SUBMITTED non-duplicate project and every judge with at least 1 submitted review.
2. Endpoints: GET /api/me/certificates (own only); GET /api/events/:eventId/certificates
   (event ORGANIZER, list + status); POST /api/events/:eventId/certificates/issue (organizer, idempotent).
3. Frontend page /certificates/:recordId: a clean, print-optimised certificate (A4 landscape via
   @media print, the classy design system, no external fonts) showing the verification URL
   <PUBLIC_URL>/verify/<id> as text and as a QR code generated locally (qrcode npm package, SVG).
   A "Download PDF" button uses window.print(); document that the browser's "Save as PDF" creates the file.
4. Public page /verify/:recordId: fetches the record, verifies the signature in the browser with
   WebCrypto Ed25519 where available (otherwise calls POST /api/records/verify) and shows
   "Valid", "Revoked" or "Invalid" with the signed details.
5. "My certificates" entry for participants and judges; the organizer "Records" tab lists issued
   records with Revoke.
6. Tests: issuing rules (who gets one, idempotency, placement only after publish), someone else's
   certificate is not listed in /me, the verify page API contract, revoked shown as revoked.

Full gate. git add . ; git commit -m "feat(t4): certificates and verification pages" ; git push
```
**Done when:** a certificate prints cleanly, the QR code opens the verify page, the verify page says Valid (and Revoked after a revoke), and run.py shows 7/7.

---

## Phase 5: Embeddable gallery widget

```
Read AGENTS.md. Same global rules. Security headers are strict today; keep them strict everywhere
except the embed routes.

1. Route /embed/gallery?eventId=…&trackId=…&theme=light|dark&limit=… : a minimal, fast page
   (a separate small Vite entry, not the full app) showing only public data (SUBMITTED projects of
   published events, like the gallery), cards linking to the project page with target="_blank"
   rel="noopener noreferrer". No auth, no cookies, no tokens are ever read on embed pages.
2. Headers: only for /embed/*, set CSP frame-ancestors * (or an EMBED_ALLOWED_ORIGINS env list)
   and don't send X-Frame-Options: DENY. Every other route must send frame-ancestors 'none'.
   Add tests that check the headers on both kinds of routes.
3. /embed.js loader: a tiny script that organizers paste into any site:
   <div data-dogfood-gallery data-event="evt_01"></div><script src="http://HOST/embed.js" async></script>
   It creates an iframe and auto-resizes it via postMessage (verify event.origin matches the portal
   origin, and accept only a { type: "dogfood:resize", height:number } message shape).
4. Organizer UI: an "Embed" card in the event Settings tab with a live preview iframe and a copyable
   snippet (with track/theme options).
5. Tests: the embed data endpoint returns only public fields; drafts never appear; header tests;
   the postMessage handler ignores wrong origins (unit test the pure validator).

Full gate. git add . ; git commit -m "feat(t4): embeddable gallery widget" ; git push
```
**Done when:** a local test HTML file embedding the widget shows the gallery and resizes, normal pages still refuse framing, and run.py shows 7/7.

---

## Phase 6: Webhooks

```
Read AGENTS.md and docs/API.md. Same global rules. No Redis or queue services: use a DB-backed
outbox with an in-process worker.

1. Models: Webhook { id, eventId, url, secret (stored encrypted with SIGNING_KEY_SECRET), events
   String[], active, createdById, createdAt } and WebhookDelivery { id, webhookId, eventType,
   payload Json, status (pending|succeeded|failed), attempts, nextAttemptAt, lastStatusCode,
   lastError, createdAt, deliveredAt }. New migration.
2. Event types (payloads contain ids and public fields only; NEVER scores, comments of judges,
   votes of individuals, emails or tokens): project.submitted, project.updated, team.created,
   judging.assignments_created, results.published, results.unpublished, voting.closed (T3),
   record.issued. Emitted from the existing services AFTER their transaction commits, by writing
   delivery rows (the outbox). Emitting must never make the original request fail or slow down.
3. Worker: runs in the app process every 5 s; sends due deliveries with a 5 s timeout; signature
   header X-Dogfood-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, t + "." + body)>, plus
   X-Dogfood-Event and X-Dogfood-Delivery headers; retries with exponential backoff (1m, 5m, 30m, 2h,
   6h), then marks failed. Unreachable URLs (for example while offline) are simply failed deliveries;
   the portal keeps working.
4. SSRF protection: only http(s); resolve the host and block link-local and metadata addresses
   (169.254.0.0/16, fe80::/10) always; block private and loopback ranges unless
   WEBHOOKS_ALLOW_PRIVATE=true (document it: useful for self-hosters on a LAN). No redirects followed.
5. Endpoints (event ORGANIZER or admin, audited): CRUD /api/events/:eventId/webhooks, POST
   /api/webhooks/:id/test (sends a ping), GET /api/webhooks/:id/deliveries, POST
   /api/webhook-deliveries/:id/redeliver. The secret is shown once on creation.
6. docs/API.md: a webhooks section with each event payload, the signature verification example
   in Node, and the retry policy. Add webhooks to the OpenAPI spec.
7. Tests (use a local HTTP server in the test): signature verifiable; retries and backoff with
   the test clock; payloads contain no sensitive fields; SSRF blocks 169.254.169.254 and private
   IPs by default; a failing receiver never breaks the original request; permissions.
8. THREAT-MODEL.md: add webhook abuse (SSRF, secret leakage, replay via the timestamp).

Full gate. git add . ; git commit -m "feat(t4): signed webhooks with retries" ; git push
```
**Done when:** the test ping reaches a local receiver with a valid signature, a failing receiver shows retries in the deliveries list, the SSRF tests pass, and run.py shows 7/7.

---

## Phase 7: Integration UI

```
Read AGENTS.md and docs/DESIGN.md (the classy, subtle design system). Build the remaining T4 UI with
existing components only. Don't change existing T1–T3 pages except adding tabs, links or buttons.
Only api/client.ts calls fetch; loading, empty and error states everywhere.

Organizer EventManage, new tabs:
- Integrations: API keys (create → show once with CopyLink and a warning, list with prefix, scopes,
  last used, Revoke), Webhooks (create with event checkboxes, list, Test button, deliveries table with
  status badges and Redeliver), a link to /api/docs.
- Import / Export: export buttons (JSON, projects CSV, judges CSV, existing results CSV); import
  JSON with a dry-run preview report (counts + errors) before an explicit "Apply import" button;
  judges CSV import with a preview.
- Records: issued records and certificates with status and Revoke.
Participant and judge: "My certificates" page listing certificates with View/Print and Verify links.
Public: /verify/:recordId (from Phase 4), polished.

Walk through each screen in the browser, check the console for errors, check phone width.
Full gate. git add . ; git commit -m "feat(t4): integrations, import/export and records UI" ; git push
```
**Done when:** every T4 feature is usable from the UI with no console errors, and run.py shows 7/7.

---

## Phase 8: Regression, docs, claim, PR

```
Read AGENTS.md.
1. Add tests/api/t4-lifecycle.test.ts: organizer creates an API key → uses it to read projects →
   registers a webhook to a local receiver → a project is submitted → the webhook arrives signed →
   judging → results published → judge records and certificates issued → the record verifies → export
   JSON → import into a fresh DB with the same counts → embed endpoint shows the projects.
2. Regression: show `git diff main --stat -- tests/` and confirm existing test files only had
   additions. Run the full gate from a clean start (docker compose down -v …). run.py must be 7/7.
3. Docs from the actual code:
   - README: T4 features, how to try each (API docs URL, embed snippet, verify tool),
     new env vars (SIGNING_KEY_SECRET, WEBHOOKS_ALLOW_PRIVATE, EMBED_ALLOWED_ORIGINS) and the
     production note to change SIGNING_KEY_SECRET; honest limitations (e.g. PDF via the browser print
     dialog, webhooks can't be delivered while offline, imported users need a password reset).
   - ARCHITECTURE.md: the new modules, the outbox worker, signing and keys, the embed isolation.
   - DATA-MODEL.md: ApiKey, SigningKey, Record, Webhook, WebhookDelivery + import/export formats.
   - docs/API.md and the OpenAPI spec complete. THREAT-MODEL.md updated.
4. .dogfood.toml: change ONLY the claimed line, and ONLY if T3 is already claimed and all 5 T4 items
   work with passing tests: claimed = ["T1", "T2", "T3", "T4"]. Otherwise leave it and list the
   finished T4 parts in the README as "partial T4".
5. python run.py .dogfood.toml > acceptance-report.txt (the checker only tests T1/T2, so the
   "claimed but not verified" note for T3/T4 is expected and honest).
6. Full gate once more.
7. git add . ; git commit -m "docs(t4): docs, regression checks, tier claim" ; git push
8. Give me the compare URL (https://github.com/<owner>/<repo>/compare/main...tier-4?expand=1) and a
   PR description listing the 5 T4 requirements, how each is met, and the test count vs baseline.
   Do not merge.
```
**Done when:** the lifecycle test passes, the docs are complete, the claim is honest, run.py shows 7/7, and you have the PR link.
