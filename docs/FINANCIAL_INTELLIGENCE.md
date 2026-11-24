# Financial intelligence: attribution, investigation, forecast, comparison, recommendations, notifications

Everything here is **deterministic arithmetic over the spend ledger** (`requests`). No model is called to produce, adjust
or explain a number. Every figure can be reproduced from ledger rows, and every recommendation stores the inputs it was
computed from. UI: **Cost Insights** (one sidebar entry, four tabs) and **Settings → Notifications**.

## 1. Attribution
Dimensions: organization (implicit), project, gateway key, application, team, provider, model.

* `requests.application`, `requests.team` (nullable) and `requests.tags` (JSON, max 5) are written by the gateway.
* **Precedence:** a gateway key can carry `application`/`team` (set by an org admin when creating it). That value is
  **authoritative**: a client header can never re-attribute spend made with that key. Headers
  (`X-SpendGuard-Application`, `X-SpendGuard-Team`, `X-SpendGuard-Tags: k=v,…`) only fill dimensions the key leaves unset.
* **Nothing is guessed.** No tag → `NULL`, reported as "Unattributed" with its share of spend. Invalid values are ignored
  (the request is still served) and reported in the `X-SpendGuard-Attribution-Ignored` response header.
* Values are normalised (trim, lower-case) and restricted to `[a-z0-9._:-]{1,64}`, so a header cannot inject markup or create
  unbounded cardinality (5 extra tags max, key ≤ 32 chars).
* **Propagation.** Browser → Next proxy (`lib/backend-proxy.ts` forwards only the three attribution headers, plus the
  "ignored" notice back) → gateway (same validation, key assignment still wins) → ledger → Cost Insights.
* **Dashboard sessions (Playground)** have no gateway key, so the server attributes them: application
  `dashboard-playground` (source `session`, stored in the row metadata) unless the user sends a valid
  `X-SpendGuard-Application`/`-Team`. The default applies to dashboard-session requests only, never to gateway keys, and
  never to team. The organization always comes from the verified token.
* Extending to a future SDK: send the same headers, or add a new tag key; no schema change is needed for tags.
* Cached input tokens are now stored per request (`cached_tokens_in`; `NULL` = not recorded, never backfilled with guesses).

## 2. Investigation (`GET /api/v1/insights/investigation`)
Window (default 24 h) versus the preceding baseline (default 7 days) scaled to the window's length.

* **Exact decomposition:** `spend = requests × tokens/request × price/token`, so
  `Δ = (R₁−R₀)·t₀·p₀ + R₁·(t₁−t₀)·p₀ + R₁·t₁·(p₁−p₀)` — volume + tokens-per-request + price-per-token, with **no residual**
  (property-tested over 500 random scenarios).
* **Contributors** per dimension (model, key, application, team, project): own change in spend, share of the total change,
  whether it is new in the window.
* **When:** the first hour/day above baseline mean + 3σ **and** 2× the mean (and ≥ $0.01). Gradual climbs that never double
  the baseline report no change point. The bucket containing the window start is excluded from both sides.
* **History:** percentile rank and multiple of the median over the **complete** UTC days of the baseline.
* **Evidence:** every statement carries `requestIds` (real ledger rows, most expensive first, no content) and a `basis`.
  The live suite verifies that every cited id exists, belongs to the project and is not a blocked row.

## 3. Forecast (`GET /api/v1/insights/forecast`)
`projected = MTD + max(0, burn − today so far) + burn × days remaining after today`, where `burn` is the mean of the
complete days observed since the first day with ledger activity. Range ≈ 80 %: `± 1.28 · σ · √days` (sample σ; assumes
independent days), never below spend already incurred.

* **Actual and predicted are separate blocks** in the API and visibly different in the UI (solid vs dashed line, "Actual" vs "Forecast" labels).
* **Sufficiency:** < 3 observed days → **no projection at all**; 3–6 low; 7–13 medium; ≥ 14 high; very uneven spend (σ > mean)
  downgrades one level; a run rate that moved > 1.5× / < 0.67× in the last 7 days adds a warning.
* **Budget status:** `exceeded` (actual), `likely_exceed` (even the low end is over), `at_risk`, `on_track`, `insufficient_data`.
* Not modelled: weekday seasonality, launches, price changes. The method text says so.

## 4. Model comparison (`GET /api/v1/insights/model-comparison`)
Historical token totals per model, re-priced at each candidate's configured prices. **Cost only.**

* A saving is a **range**: low end re-prices at the observed cache-hit rate with identical token counts; high end assumes no
  caching and, where documented, a tokenizer difference (Anthropic: ~30 % more tokens than pre-4.7 models).
* Ranking uses the conservative end, so a risky saving cannot outrank a safe one.
* Compatibility checks: context window vs the largest prompt ever seen (fail / warn / unknown), provider key available,
  retirement announced. **Not assessed, and said so every time:** output quality, latency, tool calling, vision, JSON mode,
  safety behaviour, rate limits. Nothing is worded as "equivalent".
* Token distributions shown: avg, p50, p95, max for input and output.

## 5. Recommendations
Five rules (thresholds are explicit constants in `calc/recommendation.rules.ts`; each rule returns `null` rather than a weak finding):

| Type | Fires when | Impact | Confidence |
|---|---|---|---|
| `SPEND_INCREASE` | window ≥ 1.5× baseline, +≥ $1, ≥ 90th percentile or ≥ 2× median | observed excess (not a prediction) | baseline sufficiency |
| `MODEL_CONCENTRATION` | one of ≥ 2 models holds ≥ 60 % of ≥ $5 | none | high |
| `BUDGET_RISK` | forecast `at_risk` / `likely_exceed` | projected overage range (forecast) | forecast sufficiency |
| `MODEL_EVALUATION` | eligible candidate, conservative saving ≥ 15 % and ≥ $5/month, ≥ 100 requests | monthly range, cost-only | **never high**; medium needs ≥ 500 requests, ≥ 14 days, clean checks |
| `HIGH_TOKEN_APPLICATION` | an application ≥ 3× the peer median tokens/request (≥ 2 apps with ≥ 50 requests) | tokens above peers | low |

Each stores `evidence`, `method`, `impact` + `basis`, `confidence`, `action`, `requiresApproval`. Lifecycle:
`OPEN → ACKNOWLEDGED | APPROVED_FOR_EVALUATION | DISMISSED (14 days)`, `RESOLVED` automatically when the condition ends,
reopened if it recurs; regeneration updates in place (stable fingerprint). **Approving a model evaluation records who/when/why
and nothing else: SpendGuard never changes any model, key or project configuration.** Only OWNER/ADMIN can approve.

## 6. Notifications
Producers publish one **event** (`budget.alert`, `recommendation.created`, `notification.test`) to `NotificationsService`;
it fans out to the in-app inbox plus every enabled organization channel that wants that type.

* Channels: **Slack** (incoming-webhook host allow-list), **signed webhook**, **email** (existing Resend service).
* **Durable:** a delivery row (`QUEUED`) is written *before* anything is queued; a lost queue job is recovered by a 5-minute
  sweep from that row. Idempotent per (channel, event id).
* **Retry:** BullMQ, 5 attempts, exponential backoff (10 s base). Transient (5xx, 429, 408, network, timeout) retry;
  permanent (other 4xx, redirects, unsafe destination, channel deleted/disabled, email not configured) fail at once.
  History keeps status, attempts and a scrubbed reason; failed deliveries can be retried manually.
* **Webhook signature:** `X-SpendGuard-Signature: v1=HMAC-SHA256(secret, "<timestamp>.<raw body>")` with
  `X-SpendGuard-Timestamp`; verify with the raw body in constant time and reject timestamps older than ~5 minutes.
* **Credentials:** destination URL/secret/recipients are AES-256-GCM envelope-encrypted at rest and **never returned**; the
  API shows a non-sensitive hint only. The signing secret is shown once at creation (or rotation).
* The existing per-project Slack webhook path is unchanged. Budget alerts are *also* published as events; configuring the same
  Slack destination in both places will notify twice.

### Duplicate delivery and the in-app inbox
* **Event vs delivery:** an event has a stable id (`alert:<alert id>`, `rec:<id>:<fingerprint>`); a delivery is one
  (event, destination). Re-publishing an event creates nothing new (unique `(channel_id, event_id)`; in-app rows use the
  unique `in_app_key` because Postgres treats NULL `channel_id` values as distinct). One event still reaches every distinct destination.
* **Duplicate destinations are warned about, never dropped.** Each channel stores a peppered hash of its normalised
  destination; two channels with the identical destination, or an organization Slack channel identical to a project's Slack
  alert webhook, get a warning (on creation, in the channel list, and when saving the project webhook). Only *identical* URLs
  are recognised: two different Slack webhook URLs for the same Slack channel cannot be told apart, so no automatic
  suppression exists. Existing project webhooks are not migrated automatically; add an organization channel, then remove
  the project webhook.
* **Inbox:** header bell with an unread badge fed by one cheap count query (every 60 s while the tab is visible, plus on
  focus); the list is fetched only when the panel opens, 20 per page with a cursor. Items link to Alerts or Cost Insights,
  or say the project no longer exists. Mark one / mark all as read.

## 7. Security review (what was checked)
* **Tenancy:** every insight/notification query is scoped by `projects.org_id` / `org_id` taken from the authenticated token,
  never from the request. Another tenant's project/channel/recommendation id is a **404**. Verified by unit tests (every
  fake-data call records its org) and live (a second org probing every endpoint).
* **No sensitive content:** queries never select prompt/response previews, IPs or metadata JSON. Evidence rows are ids, times,
  models, tokens and costs. Recommendation notifications carry a summary, never the evidence payload.
* **SSRF:** destinations must be https (http only with an explicit dev flag), carry no credentials, and **every** resolved address
  must be public (loopback, RFC1918, link-local/cloud metadata 169.254.x, CGNAT, multicast, IPv6 ULA/link-local, IPv4-mapped
  are refused). Checked at creation and again before each delivery; redirects are never followed.
* **Injection:** dimensions are a whitelist (no free-form column names); all raw SQL is parameterised.
* **Roles:** channels/deliveries/refresh/approval are OWNER or ADMIN; reading insights and acknowledging/dismissing is any member.
* **DNS rebinding:** closed. The hostname is resolved once, every answer is validated, and the connection is pinned to those
  addresses (TLS still verifies the original hostname). See `docs/SECURITY_HARDENING.md`, which also documents the signature
  format with a receiver example, secret rotation (grace window) and the channel audit trail.

## 8. Performance (measured; see `docs/benchmarks/`)

Method: `server/bench/insights.bench.ts` drives the real services over real PostgreSQL 16 (Docker, default config: `shared_buffers=128MB`,
`work_mem=4MB`, benchmark and database sharing one laptop) with synthetic data (8 projects, skewed models/applications, 60 days, 2% blocked,
a second organization present). Warm cache, 30 iterations (15 at 1M), p99 is therefore the maximum of that few samples. **These numbers describe
that environment only**; nothing is claimed about production hardware.

Practical budget used here: **interactive endpoints p95 ≤ 1 s**.

| endpoint (organization-wide unless noted) | 10k rows p95 | 100k rows p95 | 1M rows p50 / p95 (ledger) | 1M p50 / p95 (rollups on) |
|---|---:|---:|---:|---:|
| attribution by model, 30 days | 40 ms | 137 ms | 1,300 / 1,550 ms | **307 / 505 ms** |
| attribution by key, 30 days | 27 ms | 339 ms | 1,729 / 5,111 ms | **293 / 648 ms** |
| forecast | 20 ms | 144 ms | 909 / 1,352 ms | **148 / 444 ms** |
| forecast, one project | 16 ms | 54 ms | 302 / 642 ms | 47 / 53 ms |
| investigation 24 h vs 7 d | 48 ms | 349 ms | 2,108 / 3,588 ms | 1,528 / 2,141 ms (**over budget**) |
| investigation 30 d vs 7 d | 53 ms | 349 ms | 4,759 / 6,777 ms | 2,616 / 3,886 ms (**over budget**) |
| model comparison 30 d | 16 ms | 171 ms | 907 / 1,366 ms | 725 / 907 ms |
| recommendations list / notification history / inbox | < 15 ms | < 15 ms | 10–16 ms | same |

* **With ~100k ledger rows in total (about half inside a 30-day window) every endpoint met the budget without any rollup.**
* **At ~1M rows** the org-wide attribution and forecast exceed it on the raw ledger; **investigation and model comparison are still slow or over
  budget even with rollups**, because they need hourly buckets and percentile statistics that a daily rollup cannot answer. The next step for them
  (not built) is an hourly rollup or per-model percentile sketches; until then, scope investigations to a project or a shorter window.
* **Query plans (1M rows):** every query used an index (`requests_project_id_created_at_idx`, `requests_created_at_idx`, `projects_org_id_slug_key`);
  there were no unindexed scans except the planner's own parallel sequential scan for the widest windows. The cost is the number of rows aggregated
  (hundreds of thousands per query), plus a `Sort Method: external merge Disk: ~36MB` where `work_mem=4MB` spills. **No additional index is supported by
  the plans**, so none was added. Raising `work_mem` for the reporting connection is a cheap thing to try in staging (not tested here).
* Memory: heap growth per call was ≤ 2 MB at every size (aggregation is in the database; nothing loads ledger history into the application).
* Queries per call: attribution 2–3 (6–7 with rollups: two raw edge windows + the rollup), forecast 3, investigation 21–28, model comparison 2–3.

### Daily rollups (`INSIGHTS_ROLLUPS=on`, off by default)
Justified by the measurements above, implemented as **derived, disposable** data: `request_daily_rollups` (project, UTC day, provider, model, key,
application, team), rebuilt per day from the ledger (`DELETE + INSERT … SELECT` in one transaction, so idempotent and atomic for readers). `requests` is
never changed and stays the source of truth.

* Reads use the rollup only for **whole UTC days up to the watermark** (`rollup_state.complete_through`); partial days at the edges and today come from the
  ledger, so results equal the ledger exactly. Proven against real Postgres for every dimension, partial/whole/future windows, NULL attribution, blocked
  rows, two organizations (`test/rollup.spec.ts`), plus a 2,000-window property test that the pieces tile the window with no gap or overlap.
* **Late-arriving rows** (a retried ledger write keeps its original timestamp): every build re-materialises the last 2 complete days; a daily
  **reconciliation** compares the ledger with the rollup for the last 35 days, logs every discrepancy, repairs the day and records the count
  (`spendguard_rollup_last_discrepancies`). Between a late row landing and the next repair a rollup-served read can be short by that row; the
  reconciliation reports it.
* Backfill: 60 days / 1M rows took ~8 s (31 days per run); the 35-day reconciliation scan took ~1 s on that data.
* Not covered: hourly buckets, percentile statistics, evidence rows (still read from the ledger).
