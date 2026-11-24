# Financial reconciliation: reservations, usage, unknown cost, pricing snapshots

SpendGuard does **not** provide an absolute hard spending cap. It enforces the cap on **reservations** (a worst-case
estimate held before the provider is called). The *actual* charge is whatever the provider reports afterwards, and it can
exceed the reservation. Every number below says which of these it is.

| Term | Meaning | Where it lives |
|---|---|---|
| **Reservation** | Worst-case amount held in Redis before the call (estimated prompt tokens × provider margin + max output tokens, at the price snapshot) | `requests.reserved_cost_usd`, Redis hold |
| **Confirmed usage** | Prompt and completion tokens both reported by the provider | `requests.usage_status = CONFIRMED` |
| **Estimated usage** | The provider returned no (or partial) usage; SpendGuard's own estimate was used and the cost is derived from it | `requests.usage_status = ESTIMATED`, response `governance.usage_status = "estimated"`, header `X-SpendGuard-Usage` |
| **Reservation overrun** | `max(0, actual − reserved)`: spend the reservation did not cover. Charged in full, reported, never hidden | `requests.reservation_overrun_usd`, response `governance.reservation.overrun_usd` |
| **Unknown provider usage** | The call failed in a way where the provider may have run and billed it, and we received no usage | `request_attempts` with `billing_status` UNCERTAIN / LIKELY_CHARGED |
| **Legacy rows** | Rows written before these columns existed | `usage_status` / `execution_status` are `NULL` = "not recorded". Never backfilled with a guess |

## Request lifecycle (one `req_<uuid>` id correlates every step, in logs, the ledger and the response id)

1. **Price snapshot.** One price row is read for the request and used for both the reservation and the settlement.
2. **Reserve** (atomic Lua, per bucket: project/month and, for key traffic, key/month). Redis down → `503 governance_unavailable`,
   the provider is **not** called (fail closed). The refusal is audited as a *blocked* row (cost 0, never spend).
3. **Provider call.**
   - Success → actual cost from provider-reported usage → **mark pending → settle** (idempotent per request id) → **ledger row**
     (written before the response is returned) → anomaly job (best effort).
   - Failure → **release** the hold (idempotent), write a `request_attempts` row. **No spend is recorded.**
4. **Ledger row** carries: tokens, cost, reserved amount, overrun, `usage_status`, the estimator numbers (see below), the exact
   price used (`metadata_json.pricing`) and attribution. No prompt or response unless the project opted in.

## What happens when something fails (exactly which states recover by themselves)

| Failure | Result | Recovery |
|---|---|---|
| Redis down before the reservation | 503, provider not called, blocked row | none needed; retry when Redis is back |
| Redis dies right after the reservation | request completes; settle fails; ledger row written once | the hold expires by TTL; reconciliation sets spend = ledger sum. Automatic |
| Redis dies during/after the provider call (success) | same as above | automatic |
| Redis dies during the call and the provider **fails** | caller gets the provider error; release fails; no ledger row | the hold keeps counting (capacity is *temporarily lower*, never higher) until its TTL (`BUDGET_HOLD_TTL_MS`). Automatic |
| Ledger insert fails | row queued for retry (`request-ledger` queue); reconciliation keeps the charge while it is pending | automatic |
| Ledger insert **and** queue both fail (database and Redis both down) | the charge is **not** in the ledger. One `LEDGER_JOURNAL {...}` error line carries the financial fields (id, project, key, model, tokens, cost, time; no content) | **manual**: re-create the row from the journal line, then reconciliation corrects spend. Alert on `spendguard_ledger_write_failures_total{stage="queue_journal_only"}` |
| Redis loses its data | next settles charge actual cost; reconciliation rebuilds counters from the ledger | automatic (scheduled job) |
| Anomaly job cannot be queued | no effect on the request; row stays `PENDING` | sweep re-queues from the database. Automatic |
| Notification delivery fails | row written before queueing; bounded retries; sweep re-queues lost jobs | automatic; permanent failures stay `FAILED` and are retryable by an admin |

Proven by `test/redis-interruption.spec.ts` (real Redis, cut at each point), `test/budget-redis.spec.ts`, `test/notification-queue.spec.ts`
(real BullMQ) and `test/anomaly-recovery.spec.ts`.

## Failed calls and unknown provider cost (the reconciliation policy)

A failed call writes no spend. That is right when the provider rejected the request, but wrong to assume when it may have run.
Each failed attempt is therefore classified (`server/src/modules/gateway/attempt-classification.ts`):

| executionStatus | Examples | billingStatus |
|---|---|---|
| `NOT_SENT` | missing provider key, invalid messages (refused by SpendGuard) | `NOT_EXPECTED` |
| `REJECTED_BY_PROVIDER` | provider 4xx: bad key, invalid request, rate limit, provider billing error | `NOT_EXPECTED` |
| `PROVIDER_ERROR` | provider 5xx / overloaded | `UNCERTAIN` |
| `EXECUTION_UNKNOWN` | timeout, connection lost, unexpected internal error | `UNCERTAIN` |
| `RESPONSE_UNUSABLE` | provider answered 2xx but the body was unreadable: it **did** run | `LIKELY_CHARGED` |

The reservation **is still released** on every failure (otherwise failures would drain the cap), so these cases are *not* silently
treated as free: they stay visible as **exposure**.

* `GET /api/v1/audit/attempts/exposure` (owner/admin): per provider, the number of unreconciled UNCERTAIN/LIKELY_CHARGED attempts and
  `maxExposureUsd`, an **upper bound** (the released reservations), not a charge.
* `PATCH /api/v1/audit/attempts/:id/reconcile` (owner/admin): after comparing with the provider invoice, record `NOT_CHARGED_CONFIRMED` or
  `CHARGED_CONFIRMED` with the invoiced `costUsd`. Once only; audited (`attempt.reconciled`).
* A confirmed charge is **not** written into the spend ledger or the budget counters: inventing a usage row for a call we have no usage for
  would fabricate accounting. It is shown as `confirmedUnledgeredUsd` so finance can book it outside SpendGuard.
* Gauges: `spendguard_unreconciled_exposure_attempts`, `spendguard_unreconciled_exposure_usd`.
* **UI:** Audit → *Failed calls & estimates* (owner/admin) shows the exposure (labelled as an upper bound), the calls waiting for an
  invoice check in plain words, a "Record outcome" form with a confirmation step, and the estimator-accuracy verdicts with their sample
  sizes. The request ledger marks `estimated` usage and `over reserve` amounts on each row.

## Token-estimator validation

Per successful request the ledger stores numbers only: `estimated_input_tokens` (raw estimate), `reserved_input_tokens` (after the provider
margin), `reserved_output_tokens`, `estimator_version`. `GET /api/v1/audit/estimator-accuracy?days=30` reports per provider/model/version:
under- and over-estimation frequency, median and p95 estimate-to-actual ratio, the margin that would have covered 99% of requests,
reservation under-coverage, output-over-reserve frequency, financial overrun (requests, USD, % of cost) and cost-weighted error.

* Only `CONFIRMED` rows are scored (an estimate cannot validate an estimate); excluded counts are shown.
* **Margins are never changed automatically.** Minimum evidence before the report calls anything conclusive: **1,000 confirmed requests per
  provider and 14 days of span**; per-model rows under 200 samples are flagged "indicative only". Below that the verdict is
  `insufficient_data` and the instruction is "keep the current margin". Even with enough data the report never recommends *lowering* a
  margin (that trades blocked traffic for overrun risk and is a business decision).
* Anthropic and Gemini margins are still **unmeasured against real traffic**; this is the mechanism to measure them. Until the sample
  thresholds are met, treat them as unvalidated.

## Pricing snapshots

* A request reads one price row at the start and uses it for the reservation **and** the settlement; the numbers are stored in the ledger
  row (`metadata_json.pricing`: input/output/cached per million, row `updated_at`, source) so any charge can be reproduced.
* **Effective time:** a new price applies to requests whose reservation starts after the serving instance has observed it. Normal
  propagation ≤ ~5 s (Redis version counter polled every `PRICING_SYNC_INTERVAL_MS`); if Redis or the notification is lost, ≤ ~60 s (a full
  reload every 12th tick). In-flight requests keep their snapshot. Past rows are never repriced.
* **Ordering:** a cached price is replaced only by a row whose `updated_at` is not older (a lagging or reordered reload cannot overwrite a newer
  price). A reload that fails does **not** advance the instance's "seen version", so the next tick retries.
* **Failure:** if the database is unreachable, the last good prices keep serving (never an empty or default rate); a failed price *write*
  changes nothing anywhere (503 `pricing_persist_failed`).
* **Observability:** each instance reports `pricingCache` in `/health/diagnostics` (version seen, last refresh, `stale` when no successful
  reload for `PRICING_STALE_AFTER_MS`) and `spendguard_pricing_cache_stale`. There is deliberately **no** per-request database read.
* Proven by `test/pricing-consistency.spec.ts` (several instances, different cache states, Redis/DB down) and `test/pricing-persistence.spec.ts`.

## The ten invariants and where each is proven

| # | Invariant | Evidence |
|---|---|---|
| 1 | Atomic budget reservation | `budget-redis.spec.ts` (50 parallel reservations admit exactly the cap) |
| 2 | Idempotent settlement | `budget-redis.spec.ts`, `redis-interruption.spec.ts` 4b |
| 3 | Idempotent release | `budget-redis.spec.ts`, `redis-interruption.spec.ts` 4b |
| 4 | No double charging | `financial-governance.spec.ts` (one settle, one ledger row), `redis-interruption.spec.ts` 8 |
| 5 | No silent zero-cost fallback for unknown usage | `financial-governance.spec.ts` (ESTIMATED never zero; timeout recorded UNCERTAIN), `provider-contract-matrix.spec.ts` (missing usage → estimated) |
| 6 | No cross-tenant financial aggregation | `financial-governance.spec.ts` (exposure/reconcile), `insights-services.spec.ts`, `rollup.spec.ts`, live insights suite |
| 7 | No historical price rewriting | `financial-governance.spec.ts` (stored snapshot reproduces the charge), `pricing-consistency.spec.ts` |
| 8 | No automatic provider/model switching | `financial-governance.spec.ts` (called with exactly the requested model); recommendation approval changes no configuration (live insights suite) |
| 9 | Reconciliation never decreases confirmed spend incorrectly | `budget-redis.spec.ts` (never lowers while a row is pending or a hold is in flight); the rollup reconciler never writes to `requests` (`rollup.spec.ts`) |
| 10 | Every financial state transition is auditable | blocked rows, `request_attempts`, `audit_log` (`attempt.reconciled`, channel actions), `LEDGER_JOURNAL` last resort |

## Known gaps (stated, not hidden)

* If the database **and** Redis are down at once after a successful provider call, the ledger row survives only as the journal log line
  (manual re-creation). A local disk spool would close this; not built.
* Exposure for UNCERTAIN attempts is an **upper bound from the reservation**, not an estimate of what the provider charged.
* A project's spend counter is lower than reality by the amount of any confirmed-but-unledgered provider charge until it is booked.
* A provider that returns usage that is wrong (not missing) cannot be detected here.
