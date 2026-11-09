# SpendGuard AI — Final Product Build Document
**PRD Alignment Review & Production Completion Plan**
Reference: AI Spend Governance Platform PRD v2.0 · Live site reviewed: https://demosaas-seven.vercel.app

---

## 1. Purpose of this document

This is the authoritative gap-closure spec between what's currently live (marketing site + dashboard shell) and the PRD's definition of a production-ready v2.0 MVP. It is meant to be handed to an AI coding agent or engineering team as the single source of truth for what remains to be built, fixed, or corrected before launch.

---

## 2. Current State Summary

| Surface | Status |
|---|---|
| Marketing site (`client/app/(marketing)`) | Live, content-complete, strongly aligned to PRD positioning and FRs |
| Dashboard shell (`client/app/(dashboard)`) | Structurally complete (all 8 required nav sections present); functional/visual bugs previously identified, fix status unconfirmed |
| Backend (`server/`) | Not yet confirmed live/wired — this document assumes it is the primary remaining work |
| Pricing/monetization | Present (3 tiers) — closes the gap originally flagged in the PRD review, but introduces a new scope-accuracy issue (Section 4) |

---

## 3. PRD Alignment — What's Correct

The marketing site accurately reflects the PRD across every MVP-scoped functional requirement:

- **FR1** Org/team/project hierarchy + RBAC — represented (multi-team cost allocation, org RBAC)
- **FR2** Encrypted key management — represented (AES-256, scoped rotation, no master key distribution)
- **FR3** Unified gateway — represented (OpenAI/Gemini/Claude, single proxy endpoint, sub-100ms overhead)
- **FR4** Full request logging — represented (immutable ledger, user/project/model/tokens/cost)
- **FR5** Budget thresholds — represented (soft warning + hard block, correctly described)
- **FR6** Real-time dashboard — represented at nav-structure level
- **FR7** Alert delivery — represented (Slack/email)
- **FR8** Exportable audit log — represented (CSV export, SOC2 framing)
- **FR9** Anomaly detection — represented, and correctly scoped as *statistical*, not ML, matching the PRD's explicit wording
- **FR10** Hard-block enforcement — represented, with correct "fail-closed" terminology
- **FR11** SDK/drop-in integration — represented (1-line base URL swap, OpenAI SDK compatibility)
- **NFR — Latency** — FAQ states 50–100ms overhead + sub-5ms Redis budget check, an exact match to the PRD's NFR
- **NFR — Fail-closed** — explicitly named and explained, matching the PRD's reliability requirement
- Earlier issue (product positioned as a conversation/meeting tool) — **resolved**; all copy is now spend/governance framed

**Conclusion: the marketing site is a faithful, well-executed translation of the PRD.**

---

## 4. Gaps and Risks to Close Before Launch

### 4.1 Scope-accuracy risk in pricing tiers (High priority)

The Enterprise tier markets **SSO (SAML/SCIM)** and **self-hosted VPC deployment** as available features. The PRD explicitly places both outside v2.0 scope:

> *"Self-hosted/on-prem deployment option — candidate for a later differentiation phase"* (Section 3, Out of Scope)
> SSO is listed under **Phase 4** (Section 8, Roadmap)

Similarly, **anomaly detection** is marketed under the "Growth & Scale" tier as a currently-available feature, but the PRD places it in **Phase 3**, after the MVP.

**Action required before any Enterprise-tier signup is accepted:**
- Either (a) explicitly build SSO, SCIM, self-hosted deployment, and anomaly detection before enabling Enterprise checkout, or (b) mark these as "Coming soon" / "Roadmap" on the pricing page until built, or (c) gate Enterprise signups behind a "Contact Sales" flow with manual expectation-setting (no self-serve checkout) until the features exist.
- This is a customer-trust and potential legal/billing-dispute issue, not just a copy nitpick — do not defer it.

### 4.2 Dashboard functional bugs (status unconfirmed — verify first)

The following were identified in an earlier review pass and must be explicitly re-verified against the live `/dashboard`:

1. `$NaN (%)` rendering in the "Spend by Model" card under sparse/zero data
2. Blank "AI Spend Velocity" chart under sparse/zero data
3. Sidebar footer overlap clipping the "Guardrail Status" card
4. Dashboard color theme (dark navy/cyan) vs. required Orange + White identity consistency with the marketing site

**Action:** Take a fresh screenshot of `/dashboard` in three data states (zero requests, sparse data, full data) and confirm each of the above is resolved. Do not assume fixed without visual verification.

### 4.3 Backend completeness (primary remaining work)

The marketing site and dashboard shell describe a fully functional product. Confirm the following are real, not mocked, before any customer-facing launch:

- Gateway actually proxies to OpenAI/Gemini/Claude and returns real responses
- Budget hard-block actually prevents a request when a project's limit is hit (test the "Marketing AI Ops — 99%" and "Payments Auto-Review — 100%" scenarios shown in the interactive sandbox against a real backend call, not a scripted demo response)
- Cost calculations reflect real per-token provider pricing, not static hardcoded numbers
- Audit log entries are genuinely immutable (attempt an update at the DB layer and confirm it's rejected)
- API keys are genuinely encrypted at rest (inspect the database directly — plaintext keys must never appear)
- Redis-based budget counters reconcile correctly against Postgres truth over time (test with induced drift)

If the current live experience is running on the interactive "sandbox" simulation shown on the marketing page rather than a real backend call, this must be clearly the case only for the *marketing demo widget*, not for actual dashboard/gateway usage.

---

## 5. Final Build Checklist (Sequenced)

### Phase A — Verification & Fix (do first)
- [ ] Screenshot-verify all 3 dashboard bugs from Section 4.2; fix any still present
- [ ] Confirm dashboard color palette matches homepage Orange + White tokens exactly (shared Tailwind config, no hardcoded hex duplication)
- [ ] Resolve pricing-tier scope-accuracy issue (Section 4.1) — pick and implement one of the three mitigation options

### Phase B — Backend production build (per PRD Section 6–7)
- [ ] Auth & Organizations (FR1) — JWT, RBAC, cross-org isolation tested
- [ ] Encrypted Key Vault (FR2) — envelope encryption, write-once-readable-never, rotation
- [ ] Gateway provider adapters (FR3) — OpenAI, Gemini, Claude, streaming supported
- [ ] Usage & Cost Engine (FR4) — async logging, versioned pricing config, accurate token/cost calc
- [ ] Budget & Alerts (FR5, FR7, FR10) — Redis pre-request check, fail-closed on Redis outage, idempotent alerts, async Postgres reconciliation
- [ ] Audit (FR4, FR8) — append-only enforcement, streamed CSV export
- [ ] Analytics aggregation endpoints (FR6) — well-formed empty results guaranteed, no null/NaN ever reaches the client
- [ ] Anomaly detection (FR9) — statistical implementation, or explicitly deferred with pricing page updated to match

### Phase C — Frontend wiring
- [ ] Replace all mocked/static dashboard data with real backend calls
- [ ] `<EmptyState />` / `<LoadingSkeleton />` applied consistently across every screen and data state
- [ ] Interactive sandbox on marketing page clearly labeled as a simulation if it does not call the live gateway

### Phase D — Platform billing (separate from AI-provider cost tracking)
- [ ] Stripe (or equivalent) subscription billing wired to the three published tiers
- [ ] Webhook handling for subscription lifecycle events
- [ ] Billing system isolated from the AI-cost-estimation engine — no shared code paths, per the earlier architectural principle

### Phase E — Pre-launch verification
- [ ] End-to-end test: create org → add project → connect real provider key → send request through gateway → confirm cost logged accurately → cross a soft-warning threshold → confirm alert fires → cross hard-block threshold → confirm request is actually blocked → export audit log as CSV
- [ ] Confirm every PRD "Success Criteria" (Section 9) passes against the real system, not a simulated demo

---

## 6. Summary Verdict

**The PRD-to-marketing-site translation is strong and largely complete.** The primary remaining risk is not the frontend — it's ensuring the backend actually delivers what the marketing site now confidently promises (real gateway proxying, real budget enforcement, real encryption, real audit immutability), and correcting the one instance where pricing tiers oversell Phase 3/4 features as currently available. Close those two categories of gap and this is a launch-ready v2.0 MVP per the PRD's own success criteria.
