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

## 🌐 Step-by-Step Browser QA Walkthrough

### 1. Organizer Dashboard — **Integrations & API** Tab
* **Log in:** `organizer@dogfood.local` (Password: `dogfood-demo`).
* **Navigate:** Go to **Organize** → Click any event (e.g., **Demo Open Hack** or **Sample Hack 2026**) → Click **Integrations & API** tab.
* **Test Actions:**
  1. **OpenAPI Spec & Swagger UI:** Click **Swagger Interactive UI →**. Verify `/api/docs` opens with interactive API documentation without console errors.
  2. **Create API Key:** Type key name `"Automation Key"` → Click **Create Key** → Verify green box shows the secret key (`dfk_...`) with a **Copy** button.
  3. **Register Webhook:** Type target URL `https://example.com/webhook`, check **Project Submitted** → Click **Register Webhook**.
  4. **Test Webhook Payload:** Click **Send Test Payload** → Click **View Logs** → Verify delivery entry appears → Test **Redeliver** button.
  5. **SSRF Defense Test:** Try registering `http://127.0.0.1:8080` as a webhook URL → Verify red error blocks it (`invalid_webhook_url`).

### 2. Organizer Dashboard — **Data Import & Export** Tab
* **Navigate:** Click **Data Import & Export** tab.
* **Test Actions:**
  1. **Export Data:** Click **Export Event JSON**, **Export Projects CSV**, **Export Judges CSV**, and **Export Results CSV**. Verify all 4 files download cleanly.
  2. **JSON Import Preview:** Select/paste the downloaded JSON into the textarea → Click **Preview (Dry Run)** → Verify a blue summary box displays expected counts (`teamsToCreate`, `projectsToCreate`).
  3. **CSV Judges Import:** Upload/paste CSV (`email,name,tracks`) → Click **Preview (Dry Run)** → Verify preview summary.

### 3. Organizer Dashboard — **Certificates & Records** Tab
* **Navigate:** Click **Certificates & Records** tab.
* **Test Actions:**
  1. **Issue Certificates:** Click **Issue Certificates Now** → Verify alert confirms generated certificate count.
  2. **View Issued List:** Verify certificates for participants and judges appear in the list with **Valid** badges.
  3. **Revoke Certificate:** Click **Revoke** on one certificate → Enter reason `"QA Revocation Test"` → Click **Confirm Revocation** → Verify status badge changes to **Revoked**.

### 4. Participant & Public Verification
* **Navigate:** Click **Certificates** in the top navigation bar (or go to `/certificates`).
* **Test Actions:**
  1. **My Certificates:** Verify earned certificates are listed.
  2. **Printable Certificate:** Click **View / Print Certificate** → Verify landscape printable layout renders with QR code and **Download PDF / Print** button.
  3. **Valid Verification:** Click **Verify** (or open `/verify/<record_id>`) → Verify green **✓ Valid Signature** badge displays along with signed details.
  4. **Revoked Verification:** Open `/verify/<revoked_record_id>` → Verify amber **⚠ Revoked Record** badge displays with reason `"QA Revocation Test"`.

### 5. Embeddable Public Gallery Widget
* **Navigate:** Open `http://localhost:8080/embed/gallery?eventId=evt_01` in a new tab or iframe.
* **Test Actions:**
  1. Verify compact gallery widget loads cleanly with search bar and track filters.
  2. Verify only submitted projects appear.

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
