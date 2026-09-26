## What this PR does
Fixes every finding from AUDIT-REPORT.md.
- Batch A (ops/platform): app healthcheck + `docker compose up -d --wait`, Prisma telemetry off,
  create-only seed (restarts no longer overwrite data), trust proxy off by default (rate-limit
  bypass fixed), 400 for malformed JSON, fresh-clone typecheck, strict CSP.
- Batch B (T1): http(s)-only project URLs (stored XSS fixed), atomic team joins (size race fixed),
  no teams/projects on unpublished events, persistent "clear duplicate".
- Batch C (judging): comments kept on draft save, duplicate rubric keys rejected, peer-score
  denials return 403 and are audited, correct flat_scorer / low_sample flags, below-target
  dashboard flag, JUDGING.md aligned with code.
- README build timeline.
## Verification
- npm test: 305 tests passed
- run.py: 7/7 PASS
- typecheck + lint clean
