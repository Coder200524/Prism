# Threat Model & Abuse Defences

As a self-hosted platform running high-stakes hackathons, maintaining the integrity of judging and community voting is critical. This document outlines the threats we anticipate, how an attacker might attempt them, and our specific mitigations and detection mechanisms, alongside known limitations.

## 1. Sybil Voting (Multiple Fake Accounts)
- **Threat**: An attacker creates many accounts to cast multiple votes for a specific project.
- **Mitigation**: Authenticated voting ensures one vote per user per track (`eventId_voterId_trackId` unique constraint). 
- **Detection**: We run a `new_account` check in `src/server/src/modules/community/abuse.ts`. If a voter's account was created **after** the event's community voting window opened, their vote is silently flagged (`flagReasons: ["new_account"]`).
- **Limitation**: Since this is an offline-friendly, self-hosted portal, we do not require email verification. A dedicated attacker who pre-registers multiple accounts *before* the voting window opens cannot be programmatically stopped. We rely on the organizer reviewing flagged votes and overall turnout.

## 2. Ballot Stuffing & Scripted Voting
- **Threat**: Bots hammering the API to submit thousands of votes.
- **Mitigation**: 
  - Strict Rate Limiting: 15 votes per hour per track per user (via Express rate limit).
  - Rate limits are keyed by authenticated user ID where possible, preventing IP rotation from bypassing per-user limits.
- **Detection**: 429 status codes are returned to the attacker.
- **Limitation**: Determined attackers distributing requests slowly across pre-registered accounts will bypass rate limits.

## 3. Order Bias on Ballots
- **Threat**: Projects appearing first on a ballot receive disproportionately more votes (the "donkey vote" effect).
- **Mitigation**: 
  - We use a **deterministic per-voter shuffle** (`src/server/src/modules/community/ballot.ts`).
  - Ballots are shuffled using a Fisher-Yates algorithm seeded with `sha256(voterId + ":" + eventId)`.
  - This guarantees that every voter receives a unique, uniformly random order, but the order remains stable for that voter upon refresh.

## 4. Voting for Own Team / Insider Voting
- **Threat**: Participants inflating their own score, or Judges/Organizers manipulating the community choice award.
- **Mitigation**:
  - **Own Team**: The voting service (`voting.service.ts`) verifies that the voter is not a member of the team that submitted the project. Attempts return `409 own_project`.
  - **Judges/Organizers**: The endpoint strictly checks `EventRole` and denies access (`403 forbidden`) to anyone assigned as an ORGANIZER or JUDGE for that event.

## 5. Tally Peeking & Leaking
- **Threat**: Voters, participants, or organizers looking at current vote counts to strategize or collude before voting closes.
- **Mitigation**: 
  - Strict time window enforcement. `GET /api/events/:eventId/community-results` returns `403 results_hidden` for **everyone**, including admins and organizers, if `now <= event.votingClose`.
  - Organizers are provided a separate `GET /api/events/:eventId/community-turnout` endpoint that only returns aggregate totals (total votes, unique voters, flagged count), keeping per-project results secret.

## 6. Comment Spam, Abuse, and Duplicates
- **Threat**: Flooding a project's comment section with spam, hate speech, or identical promotional messages.
- **Mitigation**:
  - **Rate Limits**: 5 comments per minute, 50 comments per day per user.
  - **Duplicate Prevention**: The system rejects identical comments (normalized by collapsing whitespace and lowercasing) posted by the same user on the same project within 10 minutes (`409 duplicate_comment`).
  - **Moderation**: Authors, organizers, and admins can soft-delete comments (setting `hiddenAt`). Soft-deleted comments are filtered out of public responses.

## 7. Cross-Site Scripting (XSS) via Comments
- **Threat**: Injecting malicious HTML or JavaScript into comment bodies.
- **Mitigation**:
  - All comment bodies are strictly validated by Zod (max length 2000) and treated purely as strings.
  - The frontend strictly renders them as plain text. `dangerouslySetInnerHTML` is explicitly forbidden.
  - Links are rendered with `rel="noopener noreferrer"` and restricted to `http(s)` protocols.
  - The server emits a strict `Content-Security-Policy` (`default-src 'self'`).

## 8. Rate-Limit Evasion via Spoofed Headers
- **Threat**: Attackers spoofing `X-Forwarded-For` headers to bypass IP-based rate limits.
- **Mitigation**: `trust proxy` is disabled in the Express app unless the `TRUST_PROXY=1` environment variable is explicitly set by the operator. The application natively keys heavily-abused limits (like comments and votes) to the authenticated `userId`.

## 9. Peer-Score Snooping by Judges
- **Threat**: A judge attempting to read another judge's assigned projects or scores to align their own grading.
- **Mitigation**: 
  - Detailed in `JUDGING.md`. A strict isolation boundary exists (`src/server/src/modules/judging/service.ts`). Any attempt by Judge A to query `GET /api/judge/scores?judge=JudgeB` yields `403` and generates an `access.denied_peer_scores` audit row.

## 10. Audit Log Tampering & Insider Abuse
- **Threat**: An organizer maliciously voiding legitimate community votes to rig the winner, then covering their tracks.
- **Mitigation**:
  - All state-changing actions route through a central `audit()` function (`src/server/src/lib/audit.ts`) which appends immutable rows to the `AuditLog` table.
  - When an organizer voids a vote via `POST /api/votes/:voteId/void`, the action and the mandatory `reason` are logged as a `vote.void` event. Restorations are logged as `vote.restore`.
  - The database schema does not expose any application-level endpoint to modify or delete audit rows. Admin access to the raw Postgres database is required to tamper with the audit trail.

## 11. Forged or Altered Participation Records & Certificates
- **Threat**: An attacker or rogue judge crafting fake judge participation certificates or altering record fields (such as review counts or dates) to claim unearned judging credentials.
- **Mitigation**:
  - All participation records are digitally signed using Ed25519 asymmetric keypairs.
  - The payload is formatted into a deterministic canonical JSON string before signing and hashing.
  - Public keys are published at `GET /api/records/keys`.
  - Anyone can independently verify authenticity online (`POST /api/records/verify`) or offline using `tools/verify-record.mjs`.
  - Attempting to alter even a single character in the payload invalidates both the `payloadHash` (SHA-256) and the Ed25519 signature.
  - Revoked records are tracked with `revokedAt` and `revokedReason`.
- **Limitation**: Verification relies on the public key fetched from the portal or operator. If the portal host itself is compromised, an attacker with access to `SIGNING_KEY_SECRET` could generate valid signatures for forged records. Operators should rotate key secrets if compromised.

