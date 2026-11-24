# Production readiness: deployment, configuration, monitoring, rollback

Passing the tests in this repository does **not** make SpendGuard production-ready. It makes it ready for a **controlled staging
deployment**. Production also needs staging soak time, configuration verification, controlled provider testing (the live suite has
**not been run** with real keys) and operational observation.

## 1. Processes

| Process | Command | Notes |
|---|---|---|
| API + workers | `node dist/src/main.js` | One process runs the HTTP API **and** every BullMQ worker (anomaly, ledger retry, notifications, alert delivery, budget reconciliation, insights, catalog sync). At least one instance must be running at all times or queues stall. `/health/diagnostics` shows `queuesWithNoWorker`. |
| Client | Next.js (`client/Dockerfile`) | Talks to the API only through its server-side proxy routes. |
| PostgreSQL 16 | | Source of truth for the ledger. |
| Redis 7 | | Budget holds and spend counters, BullMQ queues, rate limits, price-version counter. **Run with AOF** (`--appendonly yes`, as `docker-compose.yml` does); AOF `everysec` can lose ~1 s of queued jobs, which the database-backed sweeps recover. Redis is not the source of truth for money: the ledger is. |

Multiple API instances are supported (atomic Lua holds, idempotent settlement, jobs deduplicated by id, price-cache version sync).

## 2. Environment checklist (never commit real values; see `server/.env.example`)

| Variable | Requirement |
|---|---|
| `DATABASE_URL` | PostgreSQL with all migrations applied |
| `REDIS_HOST/PORT/PASSWORD` | Persistent Redis; the gateway **fails closed (503)** without it |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Random, ≥ 32 bytes, different from each other |
| `ENCRYPTION_MASTER_KEY` | Random, ≥ 32 bytes. Encrypts provider keys and notification destinations/secrets. **Losing it makes them unreadable; changing it without re-encryption breaks them.** Back it up separately from the database |
| `TRUST_PROXY` | Set when behind the Next.js proxy/load balancer so client IPs and rate limits are right |
| Provider keys | Customers' keys live encrypted in the vault. Platform `OPENAI_API_KEY` etc. must stay **unset** in production (tenant traffic must never use them) |
| `RESEND_API_KEY` | Required for email notifications/password reset; without it email deliveries fail permanently with an explicit reason |
| `NOTIFICATION_ALLOW_HTTP`, `NOTIFICATION_ALLOW_PRIVATE_NETWORKS` | **Must be unset/false in production** (SSRF protection). `NOTIFICATION_ALLOWED_PORTS`, `NOTIFICATION_SLACK_HOSTS` only if needed |
| `HEALTH_DIAGNOSTICS_TOKEN` | ≥ 16 random chars to enable `/health/diagnostics` and `/health/metrics`; unset = both return 404 |
| `INSIGHTS_ROLLUPS` | `on` to use daily rollups (see §6). Default off |
| `BUDGET_HOLD_TTL_MS`, `GATEWAY_PROXY_TIMEOUT_MS`, `PRICING_*`, `GATEWAY_ESTIMATE_MARGIN_*` | Defaults are safe; change on evidence |

## 3. Migrations and deployment order

Migrations are **additive** (new nullable columns, new tables, new indexes). Nothing is dropped, rewritten or backfilled; legacy rows keep
`NULL` for the new columns. Unapplied since the Financial Intelligence work, in order:

```
20261124140000_attempts_anomaly_status_reservation
20261125100000_financial_intelligence
20261126100000_audit_org_scope
20261126110000_inbox_index
20261126120000_notification_dedupe
20261127100000_usage_status_and_attempt_billing
20261127110000_request_daily_rollups
```

1. Back up the database.
2. `cd server && npx prisma migrate deploy` (never `migrate dev`/`reset` against a shared database). Index creation takes a short lock on the
   affected tables; on a very large `requests` table apply during low traffic.
3. `npx prisma generate` as part of the build; deploy the new API image. Old and new code can run side by side briefly (new columns are nullable;
   the new code tolerates `NULL`).
4. Deploy the client.
5. Restart workers (they are the API process) so the new queue jobs and schedulers register.

Verify: `GET /health/ready` is 200; `/health/diagnostics` (with the token) shows `status: ok`, every queue has a worker, `pricingCache.stale: false`.
Send one gateway request and check `X-SpendGuard-Usage` and the ledger row (`usage_status`, estimator fields).

## 4. Rollback

* **Code:** redeploy the previous image. The additive columns/tables are ignored by older code. Do **not** drop them; they hold financial/audit data.
* **Rollups:** set `INSIGHTS_ROLLUPS` off (or unset) and restart: every read goes back to the ledger immediately. `request_daily_rollups` can be truncated at will.
* **Migrations are not reversed.** If one must be undone, do it by hand with a restored backup in a staging rehearsal first; there are no destructive
  steps in these migrations, so rollback by code is the supported path.

## 5. Health, monitoring, alerting

| Endpoint | Purpose | Exposure |
|---|---|---|
| `GET /health/live` | process up | public, no details |
| `GET /health/ready` | database **and** Redis reachable → 200, else 503 (`ok`/`down` only) | public |
| `GET /health` | legacy combined check used by docker-compose | public, no error text |
| `GET /health/diagnostics` | workers per queue, backlogs, notification backlog, pending anomaly evaluations, unreconciled exposure, price-cache freshness, rollup status | `X-Health-Token`; 404 unless configured |
| `GET /health/metrics` | Prometheus text | `X-Health-Token`; 404 unless configured |

Suggested alerts (`spendguard_*`):

| Alert | Condition |
|---|---|
| Instance not ready | `/health/ready` ≠ 200 for 1 min |
| Redis down | `spendguard_redis_up == 0` or rate of `spendguard_gateway_requests_total{outcome="blocked_governance_unavailable"}` > 0 |
| Settlement failing | `increase(spendguard_redis_failures_total{op="settle"}[5m]) > 0` |
| **Charge at risk of being lost** | `increase(spendguard_ledger_write_failures_total{stage="queue_journal_only"}[1h]) > 0` (page; see FINANCIAL_RECONCILIATION.md) |
| Ledger retries piling up | `spendguard_queue_waiting{queue="request-ledger"} > 0` for 10 min |
| No worker | `spendguard_queue_workers == 0` for any queue |
| Notifications stuck | `spendguard_notification_oldest_pending_seconds > 900`; or `spendguard_notification_failed_24h` rising |
| Unknown provider cost | `spendguard_unreconciled_exposure_usd` above your tolerance |
| Stale prices | `spendguard_pricing_cache_stale == 1` for 5 min |
| Anomaly backlog | `spendguard_anomaly_pending_over_10m > 0` |
| Reservation overruns | rate of `spendguard_reservation_overruns_total` (cap is enforced on reservations; overruns are real spend) |
| Rollup drift | `spendguard_rollup_last_discrepancies > 0` |
| Latency | p95 of `spendguard_reservation_duration_ms`, `spendguard_settlement_duration_ms`, `spendguard_provider_duration_ms` |

Logs: Nest logger lines; the correlation id for money events is the request id (`req_<uuid>`, also the response id `chatcmpl-req_…`); the HTTP
`X-Request-Id` is on every response and error body. Logs never contain prompts, responses, API keys, webhook secrets or full destination URLs
(scrubbing is covered by tests). Metric labels are bounded enums only.

## 6. Daily rollups (optional, evidence-based)

Measured at 1,000,000 ledger rows (see `docs/benchmarks/`), org-wide 30-day attribution p50 fell from ~1.3–1.7 s to ~0.27–0.31 s and the
organization forecast from ~0.9 s to ~0.15 s; **investigation and model comparison did not meet a 1 s budget either way** (they need hourly
buckets and percentiles that the daily rollup cannot answer). Enable in staging, watch `insightsRollup.completeThrough` and
`lastDiscrepancies`, keep it only if you are satisfied. It is derived data: the ledger stays the source of truth and every read can fall back to it.

## 7. Staging checklist

1. Back up; apply migrations; deploy API + client.
2. Confirm §3 verification; confirm `NOTIFICATION_ALLOW_*` are unset and no platform provider keys are set.
3. Set `HEALTH_DIAGNOSTICS_TOKEN`; scrape `/health/metrics`; create the alerts in §5.
4. Run the live provider suite **with real, low-limit keys** (`LIVE_PROVIDER_TESTS=1 LIVE_<P>_API_KEY=… npm run test:providers:live`) and record which providers
   passed. Providers that were NOT RUN are unverified.
5. Run the e2e suites (`test:e2e`, `test:e2e:reliability`, `test:e2e:insights`) against staging with test data only.
6. Restart Redis once under light load and confirm: gateway returns 503 then recovers; `request-ledger` and `notification-delivery` queues drain; no
   duplicate ledger rows.
7. Create a notification channel (webhook to a staging receiver), test-send, rotate the secret, confirm signature verification with the documented example.
8. Run for at least a week with real-shaped traffic; review `/api/v1/audit/estimator-accuracy` before touching any estimator margin.
9. Only then consider production, with the overrun and exposure alerts live.
