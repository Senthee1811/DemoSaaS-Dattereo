# Deployment checklist: controlled staging

Passing this checklist makes a **staging** deployment safe to attempt. It does not make SpendGuard production-ready: that also needs
staging soak time, live provider validation with real (low-limit) keys, and operational observation. See
`docs/PRODUCTION_READINESS.md` for the reasoning behind each item and `docs/FINANCIAL_RECONCILIATION.md` for the money-path rules.

## 0. Before you start
- [ ] The target is **staging**, not production. Print the database host and name and read them aloud: `node -e "const u=new URL(process.env.DATABASE_URL);console.log(u.hostname,u.pathname)"`.
- [ ] A database backup exists and a restore has been rehearsed at least once.
- [ ] The release commit's CI is green: server build + unit tests (with the job's throwaway Redis), real-Postgres suites (`npm run test:db`), client typecheck, lint, tests, production build, and the e2e suites (original, reliability, insights, Redis outage).

## 1. Environment variables (never commit real values; examples are in `server/.env.example`)
Server:
- [ ] `DATABASE_URL`, `REDIS_HOST/PORT/PASSWORD`
- [ ] `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`: random, ≥ 32 bytes, different
- [ ] `ENCRYPTION_MASTER_KEY`: random, ≥ 32 bytes, **backed up separately** (losing it makes stored provider keys and notification destinations unreadable)
- [ ] `TRUST_PROXY` matches the real proxy chain
- [ ] **Unset** in staging/production: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY` (tenant traffic must never use a platform key), `NOTIFICATION_ALLOW_HTTP`, `NOTIFICATION_ALLOW_PRIVATE_NETWORKS`
- [ ] `RESEND_API_KEY` if email notifications are wanted (otherwise email deliveries fail permanently with an explicit reason)
- [ ] `HEALTH_DIAGNOSTICS_TOKEN` (≥ 16 random chars) so `/health/diagnostics` and `/health/metrics` can be scraped; unset = both return 404
- [ ] Optional, off by default: `INSIGHTS_ROLLUPS=on` (see PRODUCTION_READINESS §6)
Client:
- [ ] `API_URL` points at the backend (server-side only; never shipped to the browser)

## 2. Database
- [ ] `cd server && npx prisma migrate status` lists exactly the migrations you expect as pending
- [ ] `npx prisma migrate deploy` (never `migrate dev` or `reset` against a shared database). All pending migrations are additive
- [ ] `npx prisma migrate status` now says "up to date"; `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code` reports no difference

## 3. Redis
- [ ] Persistence on (`--appendonly yes`); eviction policy `noeviction`
- [ ] Not shared with an unrelated application (queue and budget keys assume exclusive use)
- [ ] After a Redis restart the gateway returns 503 `governance_unavailable` and recovers by itself (verified in step 8)

## 4. Build and deploy
- [ ] Server: `npx prisma generate && npm run build`; start `node dist/src/main.js` (this one process serves the API **and** runs every BullMQ worker; run at least one instance at all times)
- [ ] Client: `npm run build` (`next build --webpack`), then `next start`
- [ ] Old and new server versions may overlap briefly (new columns are nullable); roll the client after the server

## 5. Health and monitoring
- [ ] `GET /health/ready` → 200 `{"status":"ready","checks":{"database":"ok","redis":"ok"}}`
- [ ] `GET /health/diagnostics` (header `X-Health-Token`) → `status: ok`, every queue lists a worker, `pricingCache.stale: false`
- [ ] Prometheus scrapes `/health/metrics`; the alerts in PRODUCTION_READINESS §5 exist (especially `ledger_write_failures_total{stage="queue_journal_only"}`, no-worker, notification backlog, unreconciled exposure, stale prices)
- [ ] Log shipping is on; spot-check that no prompt text, API key, webhook secret or full destination URL appears in the logs

## 6. Credentials and integrations
- [ ] Create a **low-limit** key for each provider you intend to support and store it in a test project's vault
- [ ] Run the live provider suite and record the result per provider: `LIVE_PROVIDER_TESTS=1 LIVE_OPENAI_API_KEY=… LIVE_ANTHROPIC_API_KEY=… LIVE_GEMINI_API_KEY=… LIVE_GROQ_API_KEY=… npm run test:providers:live`. A provider that prints **NOT RUN** is unverified; do not describe it as supported
- [ ] Create one webhook channel to a staging receiver; test-send; verify the signature with the example in `docs/SECURITY_HARDENING.md`; rotate the secret; confirm the grace behaviour
- [ ] Create one Slack channel and send a test; confirm no duplicate when a project-level webhook points at the same Slack URL (the UI warns; both still deliver)

## 7. Functional checks in a browser (production build)
Run `node client/scripts/perf/verify.mjs` against a staging-like stack seeded with `seed.mjs` (throwaway data only), or do the equivalent by hand:
- [ ] Every workspace opens, shows a skeleton then its content, no console errors
- [ ] Cost Insights: tabs, freshness label, forecast chart appears at the placeholder's height, selected tab remembered
- [ ] Audit: request ledger, *Failed calls & estimates*, record an invoice outcome (confirmation first), CSV export columns
- [ ] Settings → Notifications: add / test / rotate / pause / duplicate warning / remove
- [ ] Bell: unread badge, mark as read; Test Bench request attributed to `dashboard-playground`
- [ ] Phone and tablet widths: no horizontal scroll

## 8. Reliability drills (once, under light load)
- [ ] Restart Redis: gateway 503 then recovery; the `request-ledger` and `notification-delivery` queues drain; no duplicate ledger rows
- [ ] Kill the server process mid-traffic and restart: anomaly evaluations and queued notifications are recovered by their sweeps
- [ ] Stop the database briefly: `/health/ready` → 503, gateway refuses (fail closed), recovery is automatic

## 9. Rollback
- [ ] Code: redeploy the previous images. Do **not** drop the new columns/tables (they hold financial and audit data); old code ignores them
- [ ] `INSIGHTS_ROLLUPS` off (or unset) + restart: every read returns to the ledger immediately; `request_daily_rollups` may be truncated
- [ ] Client: the previous build is compatible with the current API (no breaking API change was made)
- [ ] There are no destructive migrations to reverse; if one is ever added, rehearse its reversal on a restored backup first

## 10. Sign-off
- [ ] A week of staging traffic reviewed: reservation overruns, exposure queue, estimator accuracy (`/api/v1/audit/estimator-accuracy`), notification failures
- [ ] Open risks from the release report are accepted in writing
