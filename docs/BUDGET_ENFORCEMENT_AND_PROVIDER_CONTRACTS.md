# Budget enforcement, provider contracts and recovery

Last verified: 2026-11-24. Everything marked **verified** was read from the provider's official documentation on
that date or measured by a test in this repository; everything marked **not verified** is stated as such.

## 1. What the budget cap guarantees (and what it does not)

The cap is enforced against **reservations**, atomically, in Redis:

1. Before the provider is called, SpendGuard reserves a *worst-case* amount: estimated prompt tokens at the input
   price plus every output token the request may produce at the output price.
2. The reservation succeeds only if `settled spend + active holds + this reservation <= cap`, checked and recorded in
   one Lua script for the project cap and (for key traffic) the key cap.
3. After the call the **provider-reported** usage is charged (never the reservation, never a cap). The unused part
   of the hold is freed.

So: **if the estimate was an upper bound, spend can never exceed the cap, however many requests race**
(`test/budget-enforcement.spec.ts`: 60 racing requests, exactly 8 admitted, spend <= cap).

If the estimate was *not* an upper bound (the prompt was under-counted, or a provider produced more output than the
limit it was sent), the real cost exceeds the reservation. That difference is the **reservation overrun**:

* it is charged in full (never hidden or capped),
* it is stored on the ledger row (`requests.reservation_overrun_usd`, `reserved_cost_usd`),
* it is returned to the caller (`governance.reservation`, header `X-SpendGuard-Reservation-Overrun`),
* it is summarised per month in analytics (`summary.reservationOverrunCount` / `reservationOverrunUsd`),
* and the next request after settled spend reaches the cap is blocked and the project frozen.

**Formal bound:** `settled spend <= cap + (sum of the overruns of requests that were in flight)`. The overrun total
is observable, so the excess is never silent (`ESTIMATES BREAK` test). Do not describe the cap as an absolute
guarantee to customers; describe it as "enforced on reservations, overruns reported".

Soft overage (project hard-block disabled) holds nothing by design; overruns are still measured against the amount
that *would* have been reserved.

### Where the output side is bounded (verified)
| Provider | Parameter sent | Documented to include reasoning/thinking? |
|---|---|---|
| OpenAI | `max_completion_tokens` | yes: "upper bound for visible output **and reasoning tokens**" (Chat Completions reference). `max_tokens` is deprecated and "not compatible with o-series models". |
| Anthropic | `max_tokens` | yes: "Thinking tokens count toward your `max_tokens` limit" (Messages reference) |
| Groq | `max_completion_tokens` | `max_tokens` is deprecated in its favour; whether it includes reasoning is **not documented** |
| Gemini | `generationConfig.maxOutputTokens` | **not verified for generateContent.** The thinking guide says the limit includes thought tokens for the *Interactions API* only. Mitigation: opt-in `GATEWAY_GEMINI_THINKING_RESERVE_TOKENS` (default 0) and overrun reporting. |

### Input-side estimate (measured)
The old `characters / 4` rule was compared with OpenAI's real BPE tokenizers (`js-tiktoken`, o200k_base and cl100k_base):

| Content | old estimate / real tokens |
|---|---|
| English prose | 1.26 |
| code | 0.91 |
| JSON | 0.57 |
| digits | 0.75 |
| Chinese / Japanese | 0.34 / 0.34 |
| emoji | 0.30 |
| base64 | 0.37 |

`pricing/token-estimator.ts` replaces it with a character-class model (letters, digits, punctuation, non-ASCII,
long high-entropy runs) that is **>= the real count on all 13 test corpora for both tokenizers**
(`test/token-estimator.spec.ts` re-measures this on every run), then multiplies by a per-provider margin:

* OpenAI / Groq 1.10, Gemini 1.25 (Google: "about 4 characters per token"; tokenizer not available offline),
* Anthropic 1.40: Anthropic documents that models from Claude Opus 4.7 on produce **~30% more tokens** for the same
  text and calls its own pre-flight count "an estimate". 1.40 = that 30% plus headroom.
* Override with `GATEWAY_ESTIMATE_MARGIN_<PROVIDER>` (>= 1).

**Not verified:** the Anthropic and Gemini margins are justified by their documentation, not measured against their
tokenizers. Anthropic offers a free `count_tokens` endpoint (5,000+ RPM) that would give exact input counts; it was
not adopted because it adds a network round trip and a dependency to every request. It is the next step if overrun
reporting shows the margin is too loose or too tight.

The estimator deliberately errs high (English prose is reserved at ~1.4x). That costs headroom near a cap, never money.

## 2. Usage semantics per provider (verified unless noted)

| | prompt tokens | cached input | reasoning/thinking | stop reasons |
|---|---|---|---|---|
| OpenAI | `usage.prompt_tokens` | `prompt_tokens_details.cached_tokens`, a subset of prompt_tokens | `completion_tokens_details.reasoning_tokens`, subset of completion_tokens (*implied by the reference, stated explicitly nowhere*) | stop, length, tool_calls, content_filter, function_call (deprecated) |
| Anthropic | `input_tokens` **excludes** cache; total = input + `cache_read_input_tokens` + `cache_creation_input_tokens` | reads 0.1x base price (0.05x Opus/Sonnet 5.5, 0.025x Fable 5.2); writes 1.25x (5 min) / 2x (1 h) | included in `output_tokens` | end_turn, max_tokens, stop_sequence, tool_use, pause_turn, refusal (a normal 200), model_context_window_exceeded |
| Gemini | `promptTokenCount` **includes** `cachedContentTokenCount` | cached rate | `thoughtsTokenCount`, separate from `candidatesTokenCount`, **billed as output** (candidates-excludes-thoughts is inferred from `totalTokenCount` listing them separately) | STOP, MAX_TOKENS, SAFETY, RECITATION, LANGUAGE, OTHER, BLOCKLIST, PROHIBITED_CONTENT, SPII, MALFORMED_FUNCTION_CALL, IMAGE_*, ... CONTINUATION |
| Groq | `prompt_tokens` | `prompt_tokens_details.cached_tokens` (Groq prompt-caching page: subset, 50% discount); not in the chat reference | **not documented** | docs show only `stop`; OpenAI set assumed |

`finish_reason` returned to callers is the provider's real stop reason mapped to the OpenAI vocabulary; the raw value
is in `governance.provider_finish_reason`. Unmapped/new values map to `stop` with the raw value preserved. `length`
is the one to watch: output was truncated by the limit and was still billed.

Roles: `system` goes to Anthropic's top-level `system` and Gemini's `systemInstruction`. OpenAI's reference says
`system` is the older role and o1+ should use `developer` (`OPENAI_SYSTEM_ROLE=developer`). **Not verified** whether the
newest OpenAI models in the catalog accept `system`; a rejection surfaces as a normalized 400 `upstream_invalid_request`,
not as a billing error.

### Error formats (verified)
OpenAI/Groq `{error:{message,type,code}}`; Anthropic `{type:"error",error:{type,message},request_id}` (429
`rate_limit_error`, 529 `overloaded_error`, 400 also for spend limits); Gemini `{error:{code,message,status,details[]}}`
and **a bad key is HTTP 400 `API_KEY_INVALID`, not 401**. All are normalized by `normalizeUpstreamError`; a provider
credential failure is **502 `upstream_auth_failed`**, never a 401 that looks like a SpendGuard auth failure.

### Streaming (not implemented; what it will require)
The gateway rejects `stream:true` today. Before enabling it, per provider:
* **OpenAI/Groq:** send `stream_options.include_usage`; usage arrives in one extra final chunk with empty `choices`, and
  *if the stream is interrupted the usage chunk may never arrive* (OpenAI reference). Settlement then needs a policy:
  charge the reservation, or an estimate, or release.
* **Anthropic:** `message_start` carries input tokens; `message_delta` usage is **cumulative**, so take the last one.
  Errors can arrive mid-stream after a 200 (`overloaded_error`).
* **Gemini / Groq:** streaming usage behaviour is **not verified** (not stated in the pages read). Verify before building.
* In every case the reservation must stay held until the final usage is known, and a client disconnect must not
  leak the hold (the hold TTL is the backstop).

## 3. Price persistence and consistency
* `PricingService.upsertModelPrice` writes Postgres **first**. On failure it throws 503 `pricing_persist_failed`,
  changes nothing in memory and reports no success (it used to update only the local memory and return the input).
* Input is validated (finite, 0 <= price < 10^6, provider enum, cached <= input).
* Memory is set from the row the database returned and only if it is not older (`updated_at`) than what is cached, so
  concurrent writers converge on the table's last write; a reload that started before a write cannot clobber it.
* Instances learn of a change through a Redis version counter (polled every 5 s; `PRICING_SYNC_INTERVAL_MS`) with a full
  reload about every minute as the fallback if Redis is down. Expect convergence in seconds normally, ~60 s worst case.
* A request snapshots its price row once: the hold and the settlement always use the same row, even if an admin edits
  or deactivates the model mid-flight.

## 4. Failed-call audit (`request_attempts`)
One row per failed gateway call: ids (request, org, project, key, user), provider, model, `error_class`, HTTP status,
upstream status/code, `estimated_cost_usd` (the **released reservation**, not spend), duration. It is separate from the
spend ledger and never carries spend. It never stores prompts, responses, credentials, headers or raw provider bodies.
Writes are durable the same way ledger rows are (DB, else retry queue). Read it at `GET /api/v1/audit/attempts`
(scoped to the caller's organization).

## 5. Anomaly processing: what is and is not guaranteed
* The request path no longer queries history. After the ledger row is written (`anomaly_status = PENDING`), a job is
  queued; a worker scores it and sets `CLEAR` / `ANOMALY` (`FAILED` if processing cannot complete; `SKIPPED` for blocked rows).
* **Queue durability is not assumed.** BullMQ jobs live in Redis. `docker-compose.yml` runs Redis with AOF
  (`--appendonly yes`, fsync every second), so a hard crash can lose up to ~1 s of queued jobs and a Redis without
  persistence loses all of them (a test asserts the compose setting is kept).
* **The database is the guarantee.** A repeatable sweep (every 5 min and at boot) re-queues rows still `PENDING`
  (>2 min old) or `FAILED` (not retried for 1 h) straight from Postgres, and marks `PENDING` rows older than 24 h
  `FAILED` (terminal) so nothing stays "pending" forever. Verified with a real BullMQ queue: a force-killed worker's job is
  recovered by another worker; a wiped queue is rebuilt by the sweep.
* Processing is idempotent (a decided row is never re-evaluated). Alerts: a short claim lease is taken, Postgres is
  checked for an alert already recorded in the window, the alert is recorded, then the claim is extended to the window.
  Delivery is **at-least-once with a database double-check**; two workers racing at the same instant remain possible
  only if both pass the Redis claim, which is atomic.
* Not covered: an alert about a spike more than 24 h old is not produced (the row is marked `FAILED`).

## 6. API semantics for anomaly state
| Surface | Field | Meaning |
|---|---|---|
| gateway response | `governance.is_anomaly` | **`null`** = not evaluated yet (was `false`; `false` would claim a clean result that does not exist yet). Falsy, so legacy `if (is_anomaly)` still works. |
| gateway response | `governance.anomaly.status` | `pending` |
| audit / analytics rows | `isAnomaly` / `is_anomaly` | boolean, `true` **only** for a confirmed anomaly |
| audit / analytics rows | `anomalyStatus` / `anomaly_status` | `PENDING` / `CLEAR` / `ANOMALY` / `FAILED` / `SKIPPED` |
| analytics summary | `anomalyCount` | confirmed anomalies; `anomalyPendingCount` = not yet evaluated (PENDING or FAILED) |
| audit CSV | columns appended | `Anomaly Status`, `Reserved (USD)`, `Reservation Overrun (USD)` (first 16 columns unchanged) |

## 7. Operational settings
`GATEWAY_ESTIMATE_MARGIN_{OPENAI,ANTHROPIC,GEMINI,GROQ}`, `GATEWAY_GEMINI_THINKING_RESERVE_TOKENS`,
`OPENAI_MAX_TOKENS_PARAM` (`max_tokens` for old-style compatible endpoints), `OPENAI_SYSTEM_ROLE`,
`ANOMALY_ALERT_DEDUP_SECONDS`, `ANOMALY_SWEEP_{INTERVAL_MS,MIN_AGE_MS,MAX_AGE_MS,FAILED_RETRY_MS,BATCH}`,
`PRICING_SYNC_INTERVAL_MS`, `PRICING_SYNC_DISABLED`. Migration `20261124140000_attempts_anomaly_status_reservation`
backfills `anomaly_status` for existing rows with one pass over `requests`; run it in a quiet window on a very large ledger.
