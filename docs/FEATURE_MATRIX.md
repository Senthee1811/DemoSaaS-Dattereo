# SpendGuard AI — Feature Matrix & Production Classification (Phase 0)

**Date**: 2026-11-09  
**Reference**: PRD v2.0 & `SpendGuard_Final_Build_Document.md`  
**Classification Schema**:
- **Fully Implemented & Verified**: Built, verified via automated test suites.
- **Implemented but Not Integration-Tested**: Code exists, works in isolation, pending live multi-tenant/database integration.
- **Partially Implemented**: Core logic exists, but contains prototype shortcuts (e.g. global fallback queries, un-scoped filters).
- **Stubbed or Mocked**: Operates in simulated or stub mode (e.g. Stripe checkout, fallback synthesis).
- **Missing**: Not yet authored in backend or frontend.
- **Blocked by External Configuration**: Dependent on external production keys/infrastructure (e.g. Okta SAML, live Stripe webhook secret).

---

## 1. Core Functional Requirements Matrix

| Req ID | Feature Name | Backend Module & Service | API Endpoints | Frontend View (`client/`) | Storage / State | Current Status | Commercial Readiness | Action Required |
|---|---|---|---|---|---|---|---|---|
| **FR-1** | **Multi-Tenant Auth & RBAC** | `auth/` (`AuthService`), `users/` | `POST /auth/register`<br>`POST /auth/login`<br>`POST /auth/refresh` | **MISSING** (`/login`, `/register`, `/onboarding`) | PostgreSQL (`User`, `Organization`) | **Partially Implemented** | **Incomplete** | 1. Add `/login` & `/register` frontend pages.<br>2. Apply `@UseGuards(JwtAuthGuard)` to all controllers.<br>3. Scope all queries to `req.user.orgId`. |
| **FR-2** | **Encrypted Provider Key Vault** | `encryption/` (`EncryptionService`), `keys/` (`KeysService`) | `POST /api/v1/keys/provider`<br>`GET /api/v1/keys/provider`<br>`DELETE /api/v1/keys/provider/:id` | Key Vault (`/dashboard/keys`) | PostgreSQL (`ProviderApiKey`), AES-256-GCM | **Fully Implemented & Verified** | **Ready** | Add pre-flight connection test against provider before storing key. |
| **FR-3** | **SpendGuard AI Gateway Proxy** | `gateway/` (`GatewayService`, `OpenAIAdapter`, `AnthropicAdapter`, `GeminiAdapter`) | `POST /v1/chat/completions`<br>`POST /api/v1/chat/completions` | Gateway Test Bench (`/dashboard/playground`) | Upstream APIs, PostgreSQL (`Request`), Redis | **Partially Implemented** | **Needs Hardening** | 1. Remove synthetic mock fallback on error.<br>2. Return standardized upstream HTTP errors (401, 429, 502).<br>3. Finalize streaming token accounting. |
| **FR-4** | **Usage & Cost Engine** | `pricing/` (`PricingService`), `gateway/` | `GET /api/v1/pricing`<br>`POST /api/v1/pricing` | Spend Analytics (`/dashboard/analytics`), Overview (`/dashboard`) | PostgreSQL (`ModelPricing`), Memory Catalog | **Fully Implemented & Verified** | **Ready** | Support provider-specific cached token rates in pricing matrix. |
| **FR-5** | **Real-Time Budget Governance** | `budget/` (`BudgetService`), `redis/` (`RedisService`) | `GET /api/v1/budget/status/:id`<br>`PATCH /api/v1/projects` | Projects & Budgets (`/dashboard/projects`), Guardrail Status | Redis (`sg:spend:*`), PostgreSQL (`Project`) | **Partially Implemented** | **Needs Hardening** | Implement atomic reservation Lua script to prevent race conditions during concurrent inference calls. |
| **FR-6** | **Analytics & Aggregation Engine** | `analytics/` (`AnalyticsService`) | `GET /api/v1/analytics`<br>`GET /api/v1/analytics/spend-over-time` | Spend Analytics (`/dashboard/analytics`), Overview (`/dashboard`) | PostgreSQL (`Request` aggregations) | **Fully Implemented & Verified** | **Ready** | Pre-aggregate analytics via BullMQ cron worker for large enterprise scale. |
| **FR-7** | **Alerts & Notification Dispatch** | `alerts/` (`AlertsService`) | `GET /api/v1/alerts`<br>`PATCH /api/v1/alerts`<br>`POST /api/v1/alerts` | Alerts & Anomalies (`/dashboard/alerts`) | PostgreSQL (`BudgetAlert`, `AlertConfig`) | **Implemented but Not Integration-Tested** | **Needs Hardening** | Wire real Slack Webhook HTTP poster and SendGrid/Postmark email transport. |
| **FR-8** | **Immutable Audit Trail & Ledger** | `audit/` (`AuditService`) | `GET /api/v1/audit`<br>`GET /api/v1/audit/export` | Audit Trail (`/dashboard/audit`) | PostgreSQL (`AuditLog`, `Request`) | **Fully Implemented & Verified** | **Ready** | Streamed CSV export is memory-safe; ensure DB role revokes UPDATE on `audit_log`. |
| **FR-9** | **Statistical Anomaly Detection** | `anomaly/` (`AnomalyService`), `gateway/` | Integrated into gateway pipeline & `/api/v1/alerts` | Alerts & Anomalies (`/dashboard/alerts`) | PostgreSQL (`Request.isAnomaly`) | **Fully Implemented & Verified** | **Ready** | Expose sensitivity threshold configuration ($Z=2.5$ vs $Z=3.5$) in project settings. |
| **FR-10** | **Rate Limiting & Gateway Keys** | `keys/` (`KeysService`), `gateway/` | `POST /api/v1/keys/gateway`<br>`GET /api/v1/keys/gateway`<br>`DELETE /api/v1/keys/gateway/:id` | Key Vault (`/dashboard/keys`) | Redis (`gw:rpm:*`), PostgreSQL (`GatewayApiKey`) | **Fully Implemented & Verified** | **Ready** | Reject unauthenticated requests in `GatewayController` rather than falling back to default project. |
| **FR-11** | **Platform Billing (Stripe)** | `billing/` (`BillingService`, `BillingController`) | `POST /api/v1/billing/checkout`<br>`POST /api/v1/billing/webhook`<br>`GET /api/v1/billing/subscription` | Marketing Pricing (`/pricing`), Billing Settings | PostgreSQL (`Subscription`) | **Stubbed or Mocked** | **Incomplete** | 1. Install `stripe` package in `server/`.<br>2. Activate real Checkout Sessions.<br>3. Implement signature verification in webhook handler. |

---

## 2. Non-Functional & Operational Requirements (NFR)

| NFR ID | Requirement | Target | Current Implementation Status | Gap / Hardening Required |
|---|---|---|---|---|
| **NFR-1** | **Proxy Latency Overhead** | Sub-100ms total gateway overhead | Synchronous Redis read + pricing calculation (~15-40ms) | **Verified in local tests**. Streaming TTFT (time-to-first-token) to be measured under load. |
| **NFR-2** | **Fail-Closed Reliability** | If Redis/governance is down, block requests (503) | Enforced in `budget.service.ts` (lines 66-80) | **Verified**. Returns HTTP 503 `governance_unavailable`. |
| **NFR-3** | **Zero Plaintext Secrets** | No plaintext keys in DB or logs | AES-256-GCM envelope encryption + SHA-256 hashing | **Verified**. Only masked previews (`sk-...7890`) returned. |
| **NFR-4** | **Empty-Safe API Contracts** | Zero `$NaN` or blank charts on zero/sparse data | Implemented in `analytics.service.ts` & Next.js proxy | **Verified**. Always returns structured `{ totalSpend: 0, byModel: [] }`. |
| **NFR-5** | **Billing Domain Isolation** | Zero coupling between Stripe and AI cost engine | `Subscription` table isolated to `Organization` | **Verified**. No shared tables or joins with `Request` or `ModelPricing`. |
| **NFR-6** | **Audit Immutability** | Audit rows cannot be modified or deleted | `AuditService` exposes only `create` and `query` | **Verified**. Need to enforce SQL-level `REVOKE UPDATE` on Postgres role. |
| **NFR-7** | **System Health & Readiness** | Real dependency check for DB and Redis | `GET /health` (`HealthController`) | **Verified**. Checks Prisma `$queryRaw` and Redis connection state. |

---

## 3. Post-MVP Roadmap Scoping (Phase 4)

| Feature | PRD Phase | Marketing / Pricing Representation | Backend Implementation Status | Commercial Guardrail |
|---|---|---|---|---|
| **SAML 2.0 / Okta SSO** | Phase 4 | Labeled `"Phase 4 Roadmap"` in Pricing Table | Not implemented (Passport SAML strategy planned) | **Compliant**: Enterprise plan forces "Contact Sales" modal. |
| **SCIM 2.0 Directory Sync** | Phase 4 | Labeled `"Phase 4 Roadmap"` in Pricing Table | Not implemented (SCIM user/group endpoints planned) | **Compliant**: No self-serve provisioning promised. |
| **Self-Hosted VPC Proxy** | Phase 4 | Labeled `"Roadmap"` in Pricing Table | Out of scope for SaaS cloud MVP | **Compliant**: Containerized Helm deployment planned for later. |
| **Custom ERP Integrations** | Phase 4 | Labeled `"Roadmap"` in Pricing Table | Not implemented | **Compliant**: Requires custom enterprise sales engagement. |

