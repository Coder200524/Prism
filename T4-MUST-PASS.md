# T4 must-pass checklist (Manual QA & Testing)

Run this on `main` or `tier-4` branch to verify all Tier 4 features for offline hackathon submission.
If any 🔴 item fails, fix it immediately: it blocks Tier 4 acceptance.

## Setup
```bash
git checkout tier-4
docker compose down -v
docker compose up -d --build --wait
python run.py .dogfood.toml
```
Open http://localhost:8080 in Chrome with DevTools (F12) → Console open.

---

## 🔴 0. Tier 4 Core Blockers

| # | Check | Test | Pass if |
|---|---|---|---|
| 0.1 | `python run.py .dogfood.toml` | Run python acceptance checker | Verified T1 T2 PASS, claimed T1 T2 T3 T4 |
| 0.2 | OpenAPI Spec | Open `/api/openapi.json` | Valid OpenAPI 3.1.0 JSON returned |
| 0.3 | Interactive Swagger UI | Open `/api/docs` | Swagger UI loads cleanly, no CSP script errors in console |
| 0.4 | Offline Security & Headers | Check Network tab on `/api/docs` and `/embed/gallery` | Zero external CDN network calls; correct frame ancestors CSP headers |

---

## 🔴 1. Developer REST API & API Keys

| # | Official T4 Item | Test | Pass if |
|---|---|---|---|
| 1.1 | API Key Creation | Organizer → Manage Event → Integrations & API → Create Key "CI Script" | Key created; `dfk_...` secret displayed ONCE with copy button |
| 1.2 | API Key Authentication | `curl -H "Authorization: Bearer dfk_..." http://localhost:8080/api/events/evt_01` | Returns 200 OK with event JSON without logging in via session |
| 1.3 | API Key Scopes | Use a `read`-only key to POST a new track | Refused with `403 insufficient_scope` |
| 1.4 | API Key Revocation | Integrations tab → Revoke key → re-run curl | Refused with `401 Unauthorized` |

---

## 🔴 2. Signed Webhooks with Retries & SSRF Defenses

| # | Official T4 Item | Test | Pass if |
|---|---|---|---|
| 2.1 | Webhook Registration | Integrations tab → Webhooks → Register `https://example.com/webhook` | Webhook registered; secret key returned |
| 2.2 | SSRF Protection | Try registering `http://127.0.0.1/internal` or `http://169.254.169.254/meta` | Refused with `400 invalid_webhook_url` (blocked loopback/private range) |
| 2.3 | Test Payload Ping | Click "Send Test Payload" on registered webhook | Delivery log entry created showing status & attempts |
| 2.4 | Webhook Delivery Logs & Redeliver | Expand "View Logs" → Click "Redeliver" | Re-triggers delivery attempt and updates log timestamp |

---

## 🔴 3. Bulk Data Import & Export System

| # | Official T4 Item | Test | Pass if |
|---|---|---|---|
| 3.1 | JSON Event Export | Data Import & Export tab → Click "Export Event JSON" | Downloads `event-*.json` file containing structure, teams, projects (no password hashes) |
| 3.2 | JSON Import Dry Run | Data Import & Export tab → Paste JSON → Click "Preview (Dry Run)" | Dry run summary appears showing team/project counts without modifying DB |
| 3.3 | CSV Exports | Export Projects CSV, Export Judges CSV, Export Results CSV | CSV files download cleanly with proper columns |
| 3.4 | CSV Judges Import | Paste CSV `email,name,tracks` → Preview (Dry Run) → Commit | Judges imported into event cleanly |

---

## 🔴 4. Verifiable Judge Records & Certificates

| # | Official T4 Item | Test | Pass if |
|---|---|---|---|
| 4.1 | Certificate Batch Issuance | Certificates & Records tab → Click "Issue Certificates Now" | Generates HMAC-SHA256 signed records for participants and judges |
| 4.2 | Participant Certificate View | Log in as participant → My Certificates (`/certificates`) | Issued certificate appears with View & Verify links |
| 4.3 | Printable Certificate & QR Code | Open `/certificates/:recordId` | Beautiful printable frame with QR code linking to `/verify/:recordId` |
| 4.4 | Public Signature Verification | Open `/verify/:recordId` without logging in | Shows green "✓ Valid Signature" badge and payload details |
| 4.5 | Certificate Revocation | Certificates & Records tab → Revoke certificate with reason | Verification page now shows amber "⚠ Revoked Record" with reason |

---

## 🔴 5. Embeddable Public Gallery Widget

| # | Official T4 Item | Test | Pass if |
|---|---|---|---|
| 5.1 | Embed Gallery Widget | Open `/embed/gallery?eventId=evt_01` in iframe | Renders compact gallery widget with search & track filter |
| 5.2 | Sensitive Data Isolation | Check `/api/embed/gallery?eventId=evt_01` response | Returns ONLY submitted projects of published events; draft projects & raw scores hidden |
| 5.3 | Auto-Resize postMessage | Embed widget height change | Sends `dogfood:resize` postMessage to parent window |

---

## 🟠 6. Quality & Polish

- No red errors in Chrome DevTools console on any T4 tab or page
- All forms handle loading states, empty states, and human-readable error messages
- Mobile responsive layout at 375px width (no overflow on API keys, webhooks, or certificate views)
