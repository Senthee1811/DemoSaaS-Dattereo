# SpendGuard AI Spend Governance Platform — Requirements Traceability Matrix (RTM)

**Single Source of Truth: PRD v2.0 & `SpendGuard_Final_Build_Document.md`**  
**Last Updated: 2026-10-02**

---

## 1. Traceability Matrix

| Req ID | Requirement Description | Backend Module (`server/src/modules/`) | Key Endpoints / Contracts | UI Screen (`client/`) | Verification & Test Method | Status |
|---|---|---|---|---|---|---|
| **FR-1** | **Multi-Tenant Auth & RBAC**<br>JWT (access + refresh), Argon2 password hashing, OrgMembership roles (OWNER, ADMIN, MEMBER), tenant isolation. | `auth/`, `organizations/`, `team/` | `POST /api/v1/auth/login`<br>`POST /api/v1/auth/register`<br>`POST /api/v1/auth/refresh`<br>`GET /api/v1/team/members` | Team & RBAC (`/dashboard/team`), Login/Register (`/login`, `/register`) | Multi-tenant isolation test: Member of Org A cannot access Org B projects/keys/logs. Role guards prevent MEMBER from editing budgets or keys. | Complete / Built |
| **FR-2** | **Encrypted Provider Key Vault**<br>Envelope encryption (AES-256-GCM data key + master key), one-way write (never return plaintext), masked preview (`sk-...ab12`), zero-downtime rotation. | `encryption/`, `keys/` | `POST /api/v1/keys/provider`<br>`GET /api/v1/keys/provider`<br>`DELETE /api/v1/keys/provider/:id`<br>`POST /api/v1/keys/provider/:id/rotate` | Key Vault & Gateway (`/dashboard/keys`) | Dedicated unit test: AES-256-GCM roundtrip, IV/tag integrity, plaintext absent from all serialization/logging. | Complete / Built |
| **FR-3** | **SpendGuard AI Gateway Proxy**<br>High-performance proxy (~50-100ms overhead) with OpenAI, Anthropic, Gemini adapters. Streaming and non-streaming. Fail-closed architecture. | `gateway/`, `gateway/adapters/` | `POST /api/v1/chat/completions`<br>`POST /gateway/v1/chat/completions` | Gateway Test Bench (`/dashboard/test-bench`) | Proxied call to OpenAI, Gemini, Claude. Headers forwarded, response streamed/returned, usage captured. | Complete / Built |
| **FR-4** | **Usage & Cost Engine**<br>Asynchronous ingestion via BullMQ, versioned database pricing table (`ModelPricing`) per provider/model, exact token accounting, cost calculation. | `pricing/`, `gateway/` | `GET /api/v1/pricing`<br>`POST /api/v1/pricing` | Spend Analytics (`/dashboard/analytics`), Overview (`/dashboard`) | Model cost calculation verified against OpenAI/Anthropic/Gemini published token rates. Fallback for unpriced models. | Complete / Built |
| **FR-5** | **Real-Time Budget Governance**<br>Pre-request synchronous Redis budget check. Soft warning (80%) and hard block (100%). Fail-closed when Redis unreachable (`governance_unavailable`). | `budget/`, `redis/` | `GET /api/v1/budget/status/:projectId`<br>`PUT /api/v1/budget/:projectId` | Projects & Budgets (`/dashboard/projects`), Guardrail Status card | Simulate budget crossing: 80% fires alert, 100% returns 429 `budget_exceeded`. Redis disconnect returns 503 `governance_unavailable`. | Complete / Built |
| **FR-6** | **Analytics & Aggregation Engine**<br>Spend over time, spend by model/provider/project/key/user. Guaranteed empty-safe responses (`{ totalSpend: 0, byModel: [] }`) preventing `$NaN` or blank charts. | `analytics/` | `GET /api/v1/analytics/overview`<br>`GET /api/v1/analytics/spend-over-time`<br>`GET /api/v1/analytics/by-model`<br>`GET /api/v1/analytics/by-project` | Spend Analytics (`/dashboard/analytics`), Overview (`/dashboard`) | Empty-state contract test: Project with 0 requests returns non-null, valid zero-valued shapes. | Complete / Built |
| **FR-7** | **Alerts & Notification Dispatch**<br>Multi-channel alerting (Email, Slack, In-App). Idempotent threshold crossing (no alert storming). Cooldown management. | `alerts/` | `GET /api/v1/alerts`<br>`PATCH /api/v1/alerts/:id/read`<br>`POST /api/v1/alerts/test` | Alerts & Anomalies (`/dashboard/alerts`) | Crossing 80% threshold sends 1 notification; subsequent requests within threshold do not refire until reset or new threshold. | Complete / Built |
| **FR-8** | **Immutable Audit Trail & Ledger**<br>Append-only ledger of every inference request and governance event. Non-updatable rows. Streamed CSV export. | `audit/` | `GET /api/v1/audit`<br>`GET /api/v1/audit/export` | Audit Trail & Ledger (`/dashboard/audit`) | Attempted SQL UPDATE rejected. Streamed CSV export produces matching records without memory exhaustion. | Complete / Built |
| **FR-9** | **Statistical Anomaly Detection**<br>Statistical z-score algorithm against rolling usage window (request volume / spend spikes). Flags anomalous requests and notifies admin. | `anomaly/` | `GET /api/v1/anomaly/flags`<br>`POST /api/v1/anomaly/evaluate` | Alerts & Anomalies (`/dashboard/alerts`) | Injected 10x token spike triggers `isAnomaly: true`, records `anomalyReason`, and triggers alert. | Complete / Built |
| **FR-10** | **Rate Limiting & Key Guardrails**<br>SpendGuard virtual keys (`sg_live_*`, `sg_test_*`), SHA-256 peppered hash, RPM/TPM sliding window limiters, provider/model allowlists. | `keys/`, `gateway/` | `POST /api/v1/keys/gateway`<br>`GET /api/v1/keys/gateway`<br>`DELETE /api/v1/keys/gateway/:id` | Key Vault & Gateway (`/dashboard/keys`) | Gateway key validation, RPM rate limit enforcement, model restriction blocks unauthorized models. | Complete / Built |
| **FR-11** | **Platform Billing & Subscription**<br>Stripe subscription lifecycle (Starter $39-49, Growth $159-199, Enterprise Custom). Strictly isolated from AI cost engine. | `billing/` | `POST /api/v1/billing/create-checkout`<br>`POST /api/v1/billing/webhook`<br>`GET /api/v1/billing/subscription` | Pricing Section (`/pricing`), Billing Settings | Stripe webhook signature verification, tier capability provisioning, complete database isolation from inference requests. | Complete / Built |

---

## 2. Architectural Guardrail Checklist

- [x] **Fail-Closed Mandatory**: Gateway terminates with 503 `governance_unavailable` if Redis is down.
- [x] **Zero Plaintext Secrets**: Provider keys envelope-encrypted with AES-256-GCM; SpendGuard gateway keys stored as SHA-256 hashes.
- [x] **Empty-Safe Contracts**: All analytics endpoints return structured zero-value defaults, eliminating `$NaN` bugs.
- [x] **Billing Domain Isolation**: `Subscription` is linked exclusively to `Organization` — zero coupling with `Request` or `ModelPricing`.
- [x] **Audit Immutability**: `AuditLog` service exposes insert and query only — no update or delete methods exist.
- [x] **Centralized Design System**: Client strictly utilizes `sg-*` semantic palette tokens (`#FF6B35` primary) with no ad-hoc hex values.
