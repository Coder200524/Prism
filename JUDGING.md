# Judging

Implementation: `src/server/src/modules/judging/` — pure `assignment.ts` and `normalization.ts`,
orchestration in `service.ts`.

## Assignment strategy

`assignReviews` (`assignment.ts`) is a pure function. Input: submitted non-duplicate projects,
judges with preferred track ids, existing assignments, and `reviewsPerProject` (K).

1. Process projects by ascending current assignment count, then id.
2. Eligible judges: event judges who are **not** on the project’s team (user id or email match)
   and not already assigned to it.
3. Prefer judges whose `JudgeTrack` set includes the project’s track. If that set is too small,
   fall back to any eligible judge and mark `trackFallback: true`.
4. Among eligible judges, pick lowest current load; ties broken by a stable SHA-256 of
   `(projectId, judgeId)` so runs are deterministic.
5. Stop when the project has K assignments or no eligible judges remain → `unassignable` with a
   reason (`no_eligible_judges`, etc.).
6. Never deletes or rewrites existing assignments (idempotent when re-run).

Organizers trigger this via `POST /api/events/:eventId/assignments/auto`.

## Weighted totals

For one submitted review, with criterion weights \(w_c\) and values \(v_c\):

\[
\text{total} = \frac{\sum_c v_c \cdot w_c}{\sum_c w_c}
\]

over criteria present in the review. Missing criteria mark the review `partial`. Fixture event
weights are **34 / 33 / 33** for `functionality` / `quality` / `innovation` (first-seen key order
from `fixtures.json`, via `equalWeightsSummingTo100`). Demo Open Hack uses **40 / 30 / 30**.

## Normalization

Computed on every results/dashboard/CSV read — nothing derived is stored.

1. Compute each review’s weighted `total`.
2. Global mean \(\mu_g\) and population σ \(\sigma_g\) over all submitted review totals in the event.
3. Per judge \(j\): mean \(\mu_j\), population σ \(\sigma_j\), count \(n_j\).
4. z-score:
   - if \(n_j < 3\) → \(z = (total - \mu_g) / \sigma_g\) (or 0 if \(\sigma_g = 0\)) and flag `low_sample`
   - else if \(\sigma_j = 0\) → \(z = 0\) and flag judge `flat_scorer`
   - else → \(z = (total - \mu_j) / \sigma_j\)
5. Rescale: \(\text{normalized} = \mathrm{clamp}(\mu_g + z \cdot \sigma_g,\ \text{rubricMin},\ \text{rubricMax})\).
6. Project `raw_score` = mean of totals; `normalized_score` = mean of normalized values;
   `review_count` = number of submitted reviews.
7. Flags: `under_reviewed` if `review_count < min(2, reviewsPerProject)`; `below_target` if
   `review_count < reviewsPerProject`; `duplicate` if `duplicateOfId` set (excluded from ranking).
8. Rank per track by normalized desc, then raw desc, then review count desc, then id. Zero-review
   projects stay unranked at the end.

Display rounding is to 2 decimals only at the edges (`roundDisplay`).

### Why the fallbacks are defensible

| Case | Behaviour | Rationale |
|---|---|---|
| Flat scorer (\(\sigma_j = 0\)) | \(z = 0\) | The judge gave no relative ranking signal; mapping them to the global mean avoids inventing spread. |
| Low sample (\(n_j < 3\)) | Use global μ/σ | A judge’s personal σ is too noisy with one or two reviews. |
| Under-reviewed project | Flag, still rank if ≥1 review | Organizers see gaps; ranking does not invent missing reviews. |
| Duplicate | Excluded from ranking | Keeps one entry for the same submission. |

## Worked example (fixture data)

Rubric weights: functionality **34**, quality **33**, innovation **33**. Score range in the
fixture event: **2–5**.

### Judge `jdg_02` (6 reviews — normal path)

| Project | Scores (F/Q/I) | Weighted total |
|---|---|---|
| `prj_05` | 4 / 3 / 2 | \( (4·34 + 3·33 + 2·33) / 100 = 3.01 \) |
| `prj_08` | 5 / 5 / 5 | 5.00 |
| `prj_11` | 4 / 5 / 5 | 4.66 |
| `prj_16` | 5 / 5 / 2 | 4.01 |
| `prj_21` | 5 / 5 / 5 | 5.00 |
| `prj_28` | 3 / 3 / 5 | 3.66 |

Per-judge stats for `jdg_02`: \(\mu_j ≈ 4.223\), \(\sigma_j ≈ 0.734\), \(n_j = 6\).

Across all **126** fixture score rows: \(\mu_g ≈ 3.566\), \(\sigma_g ≈ 0.649\).

For `prj_05`:

\[
z = \frac{3.01 - 4.223}{0.734} ≈ -1.65,\quad
\text{normalized} = \mathrm{clamp}(3.566 + (-1.65)·0.649,\ 2,\ 5) ≈ 2.49
\]

So a harsh-relative score from a generally high-scoring judge is pulled toward (but not below)
the rubric floor after z-rescaling.

### Judge `jdg_07` (flat scorer)

Three reviews, every criterion **4** → totals `[4, 4, 4]`, \(\sigma_j = 0\). Every review gets
\(z = 0\), so normalized = \(\mu_g ≈ 3.57\) (clamped into 2–5). Flag: `flat_scorer`.

### Judge `jdg_03` (low sample)

Only two reviews (`prj_01` total 4.33, `prj_35` total 3.35). Uses **global** μ/σ for z. Flag:
`low_sample`.

## Community Voting (Tier 3)

Community voting is entirely separate from the official judge scoring workflow. 
1. **One vote per track:** Authenticated users (not acting as organizers or judges for the event) can cast a single vote per track.
2. **Hidden tallies:** Unlike judge dashboards, live voting tallies are strictly hidden (`403 results_hidden`) from **everyone**, including organizers, until the voting window closes (`votingClose`).
3. **No normalized merging:** Community votes do not affect the `raw_score` or `normalized_score` produced by the judge normalization engine. The community vote determines a separate "Community Choice" ranking.
4. **Fraud handling:** Suspect votes (e.g., from accounts created after voting opened) are flagged but still initially tallied. Organizers can review these post-close and explicitly void them. Voided votes are immediately excluded from the public final community tallies.

## Isolation

Judges must not see peer scores, comments, or completion status.

| Endpoint | Check |
|---|---|
| `GET /api/judge/assignments` | Only rows where `judgeId = req.user.id` (ADMIN may list empty/other via role bypass on the “not a judge” gate only; still filtered by judge id when querying as self). |
| `GET /api/judge/assignments/:id` | Owner, event ORGANIZER, or ADMIN. |
| `PUT /api/judge/assignments/:id/scores` | Owner (or ADMIN); never another judge. |
| `GET /api/judge/scores` | Self by default. `?judge=` other id allowed only for ADMIN or ORGANIZER of the scoped event(s); otherwise `403` and audit `access.denied_peer_scores`. |
| `GET /api/events/:id/results` (public) | After publish; omits per-judge data and flags. |
| Organizer `GET .../assignments`, dashboard, CSV `type=scores` | Organizer/ADMIN only — intentional visibility for ops, not for peer judges. |

UI never substitutes for these checks.

## Limitations

- Auto-assign cannot create reviews when too few non-conflicted judges exist; projects land in
  `unassignable`.
- With K > number of eligible judges, projects remain under-reviewed by design.
- Flat / low-sample fallbacks compress signal; they are documented trade-offs, not a full
  Bayesian model.
- Judging is closed while submissions are still open (`judgingOpen` requires
  `now >= submissionsClose`) and after results are published.
- No blind judging UI beyond omitting peer data — organizers who export `type=scores` see judge
  names.
- Normalization ignores partial reviews’ missing criteria in the weight sum rather than
  imputing values.

## Verifiable judge records

When results are published (or via explicit organizer action), verifiable participation records are issued for judges with at least one submitted review.

1. **What is signed:** Ed25519 digital signature over canonical JSON payload `{ id, type, eventId, eventName, judgeDisplayName, reviewsSubmitted, firstReviewAt, lastReviewAt, issuer, issuedAt }`.
2. **Why no scores or comments:** To preserve judge isolation and confidentiality, specific project scores and review comments are strictly excluded from the verifiable record payload.
3. **Canonicalisation:** Keys are recursively sorted alphabetically; arrays and primitives stringified without whitespace (UTF-8).
4. **Key rotation & verification:** Public keys are served at `GET /api/records/keys` with key ID (`kid`). Retired keys remain in the table to verify past records. Verification can be performed online via `POST /api/records/verify` or offline using `tools/verify-record.mjs`.
5. **Revocation:** Organizers and admins can revoke records with a reason via `POST /api/records/:id/revoke`.

