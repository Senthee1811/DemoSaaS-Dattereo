# SpendGuard AI — Production Implementation Audit (Phase 0)

**Date**: 2026-11-09  
**Repository Branch**: `feat/Rebuild` (Protected snapshot: `backup-pre-production-revamp`)  
**Auditor**: Principal Systems Architect & FinOps Infrastructure Team  
**Standard**: Commercial SaaS Production Readiness vs. PRD v2.0 & Build Document  

---

## 1. Executive Summary

SpendGuard AI has achieved a solid structural foundation: a monorepo partitioned cleanly into a Next.js 15 client (`client/`) and a NestJS 10 backend (`server/`), backed by PostgreSQL (Prisma), Redis (ioredis), and BullMQ. Core cryptographic foundations (AES-256-GCM envelope encryption for provider keys, SHA-256 for gateway tokens), statistical Z-score anomaly detection, fail-closed Redis budget checks, and empty-safe analytics responses are implemented and verified via unit tests.

However, a rigorous inspection of every controller, service, adapter, and frontend route reveals that **the system is currently an advanced prototype rather than a deployable commercial SaaS product**. 

### Critical Findings Summary
1. **Zero Multi-Tenant API Route Protection**: While `JwtAuthGuard` and `RolesGuard` exist in `server/src/modules/auth/guards/`, `@UseGuards(JwtAuthGuard)` is **not applied to a single controller** across the entire backend. All project, key, alert, team, analytics, and billing endpoints can be accessed unauthenticated.
2. **Missing Frontend Customer Authentication & Onboarding**: The client contains `/app/dashboard` and `/app/(marketing)`, but **no `/login`, `/register`, `/onboarding`, or `/settings` pages exist**. A new customer cannot sign up, create an organization, or connect their first key through the UI.
3. **Implicit Global Tenant Coupling**: `OrganizationsService`, `TeamService`, and `GatewayController` fall back to `await this.prisma.organization.findFirst()` or `findFirst({ where: { isBlocked: false } })`. If multi-tenancy were enabled, users would read and mutate the first organization created in the database.
4. **Non-Atomic Budget Enforcement (Concurrency Race Condition)**: Budget checking in `BudgetService.checkBudgetGuardrail` reads the current monthly spend before request dispatch, and increments it *after* completion. Under concurrent requests, multiple parallel inferences can pass the same budget check simultaneously before any deduction occurs. Atomic reservation via Redis Lua scripts is missing.
5. **Gateway Provider Fallback to Synthesis**: Upstream adapters (`OpenAIAdapter`, `AnthropicAdapter`, `GeminiAdapter`) fall back to generated synthetic text when keys are missing or upstream errors occur (`isSimulated: true`), rather than returning normalized upstream HTTP error codes (e.g. 401, 429, 502) to the calling client.
6. **Platform Billing (Stripe) Operating in Stub Mode**: The `stripe` npm package is not installed in `server/`, and real Stripe SDK calls in `BillingService` are commented out, returning mock sessions.

---

## 2. Monorepo & Infrastructure Inventory

```
D:\DemoProject-SaaS\
├── package.json               # Monorepo root scripts: dev:client, dev:server, build:*, test:*
├── .gitignore                 # Configured for Next.js, NestJS, and environment secrets
├── SpendGuard_Final_Build_Document.md # Definitive PRD v2.0 gap-closure specification
├── client/                    # Next.js 15 App Router Frontend
│   ├── app/                   # (marketing), dashboard, api proxy routes
│   ├── components/            # UI components (alerts, audit, dashboard, keys, projects, team)
│   ├── lib/                   # Utility libraries and legacy prototype scripts
│   └── data/                  # spendguard-store.json (legacy prototype store)
├── server/                    # NestJS 10 Production Backend
│   ├── prisma/                # schema.prisma (10 models), seed.ts
│   ├── src/                   # NestJS modules, common middleware, filters, config
│   └── test/                  # run-tests.ts, spendguard.spec.ts
└── docs/                      # Technical documentation & audit artifacts
```

### Dependency Audit
- **Root `package.json`**: Centralizes workspace script execution cleanly.
- **Server `package.json`**:
  - Installed: `@nestjs/common`, `@nestjs/config`, `@nestjs/jwt`, `@nestjs/passport`, `ioredis`, `@prisma/client`, `argon2`, `class-validator`, `bullmq`, `pino`.
  - **Missing**: `stripe` (required for real billing integration).
- **Client `package.json`**:
  - Installed: `next` 15, `react` 19, `lucide-react`, `tailwindcss`, `clsx`, `tailwind-merge`.

---

## 3. Backend Module-by-Module Audit (`server/src/modules/`)

### 3.1 Auth & RBAC (`server/src/modules/auth/`)
- **Status**: Implemented but Unbound to Controllers.
- **Components**: `auth.controller.ts`, `auth.service.ts`, `jwt.strategy.ts`, `jwt-auth.guard.ts`, `roles.guard.ts`.
- **Findings**:
  - Password hashing uses PBKDF2 with salt (`$pbkdf2$<salt>$<hash>`) to prevent native binary binding issues on Windows environments.
  - JWT Access (15m) and Refresh (7d) token generation is correctly implemented in `AuthService`.
  - Organization membership checks and role decorators (`@Roles('OWNER', 'ADMIN')`) are written.
  - **CRITICAL GAP**: Neither `JwtAuthGuard` nor `RolesGuard` is bound globally or applied to any functional controller in `server/src/modules/`. Any client can issue HTTP requests without a Bearer token.
  - **Missing**: Refresh token revocation table/whitelist in database, password reset flow, email verification.

### 3.2 Organizations & Projects (`server/src/modules/organizations/`)
- **Status**: Partially Implemented / Prototype Coupling.
- **Components**: `organizations.controller.ts`, `organizations.service.ts`.
- **Findings**:
  - `listProjects(orgId?: string)` accepts `orgId`, but line 30 executes `this.prisma.project.findMany()` with **no orgId filter** when omitted.
  - `createProject(dto)` automatically resolves to `await this.prisma.organization.findFirst()` on line 92. If multiple tenants exist, all created projects attach to whichever organization was created first in PostgreSQL.
  - No authorization guard prevents a member of Tenant A from modifying the budget of Tenant B via `PATCH /api/v1/projects`.

### 3.3 Team & Memberships (`server/src/modules/team/`)
- **Status**: Partially Implemented / Stubbed Data.
- **Components**: `team.controller.ts`, `team.service.ts`.
- **Findings**:
  - `listMembers()` queries `this.prisma.organization.findFirst()` rather than the authenticated caller's tenant.
  - `inviteMember()` creates user rows with hardcoded mock hash:
    `passwordHash: '$argon2id$mock-hash-for-demo'` (line 46).
  - No transactional invitation token or email dispatch is executed.

### 3.4 Key Vault & Envelope Encryption (`server/src/modules/keys/`, `encryption/`)
- **Status**: Fully Implemented & Unit Tested (Lacks Upstream Validation).
- **Components**: `encryption.service.ts`, `keys.service.ts`, `keys.controller.ts`.
- **Findings**:
  - AES-256-GCM envelope encryption is verified in `spendguard.spec.ts` and `run-tests.ts`.
  - Master key is properly sourced from `ENCRYPTION_MASTER_KEY` env var.
  - Customer gateway keys (`sg_live_*`, `sg_test_*`) are hashed via SHA-256 peppered hashing.
  - Plaintext provider keys are never returned by API endpoints (only `maskedPreview`, e.g. `sk-...7890`).
  - **Gap**: `storeProviderKey` stores credentials without performing an active upstream connectivity handshake with OpenAI/Anthropic/Gemini to verify validity before saving.

### 3.5 AI Gateway Proxy (`server/src/modules/gateway/`)
- **Status**: Functional / Fallback to Mock Synthesis.
- **Components**: `gateway.controller.ts`, `gateway.service.ts`, adapters (`openai`, `anthropic`, `gemini`).
- **Findings**:
  - Endpoint `POST /v1/chat/completions` handles OpenAI-compatible payload schema.
  - Gateway key lookup by `hashedSecret` supports RPM rate limiting via Redis sliding window (`gw:rpm:<keyId>:<min>`).
  - Model allowlists and provider allowlists are enforced per gateway key.
  - **CRITICAL GAP 1**: If no key or project is provided in headers, line 154 falls back to `findFirst({ where: { isBlocked: false } })` or `'proj_copilot'`. An unauthenticated public request can execute against a random project.
  - **CRITICAL GAP 2**: When upstream provider calls fail or keys are missing, adapters synthesize responses:
    `[SpendGuard Proxy: gpt-4o] Processed inference for query...` with `isSimulated: true`. In commercial production, upstream failures must return standardized errors (`401 invalid_api_key`, `429 upstream_rate_limit`, `502 upstream_error`).
  - **CRITICAL GAP 3**: Streaming token consumption is not finalized via Server-Sent Events (SSE) stream accounting.

### 3.6 Budget Engine & Redis Guardrail (`server/src/modules/budget/`, `redis/`)
- **Status**: Functional (Non-Atomic Race Condition).
- **Components**: `budget.service.ts`, `redis.service.ts`, `budget-reconciliation.processor.ts`.
- **Findings**:
  - Pre-flight budget verification enforces **fail-closed** behavior: if Redis is disconnected, it blocks requests with HTTP 503 `governance_unavailable`.
  - Hard-block threshold (100%) blocks requests with HTTP 429 `budget_exceeded`.
  - Soft-warning threshold (80%) triggers idempotent notifications.
  - BullMQ reconciliation job (`BudgetReconciliationProcessor`) runs periodically to reconcile Redis drift against Postgres.
  - **CRITICAL GAP**: The budget check is **read-then-write**, not **atomic reservation**. Under 50 concurrent requests, all 50 can read a remaining budget of $1.00, pass validation, consume $50.00, and massively overrun the cap before post-request reconciliation triggers.

### 3.7 Anomaly Detection Engine (`server/src/modules/anomaly/`)
- **Status**: Fully Implemented & Unit Tested.
- **Components**: `anomaly.service.ts`.
- **Findings**:
  - Implements statistical Z-score calculation against 40 rolling project requests.
  - Minimum sample size heuristic (< 5 requests falls back to $0.40 / 25k token threshold).
  - Flags anomalies with $Z \ge 3.0$ and cost multiplier $\ge 3.0\times$ mean.
  - Unit test verifies an 88.9x spike is detected with a Z-Score of 465.38.

### 3.8 Platform Billing (`server/src/modules/billing/`)
- **Status**: Stubbed Mode.
- **Components**: `billing.service.ts`, `billing.controller.ts`.
- **Findings**:
  - `Subscription` schema is cleanly decoupled from AI request tables, connected only to `Organization`.
  - Stripe SDK is commented out in `billing.service.ts` (lines 48–52).
  - When `createCheckoutSession` is called, it returns a stub URL: `${params.successUrl}?session_id=stub_session_${Date.now()}`.
  - Webhook endpoint lacks signature verification via `stripe.webhooks.constructEvent()`.

---

## 4. Frontend Audit (`client/`)

### 4.1 Missing User Experience Workflows
| Page / Flow | Expected Path | Current Status | Impact |
|---|---|---|---|
| User Registration | `/register` | **Missing** | New customers cannot self-serve register. |
| User Login | `/login` | **Missing** | Customers cannot log in or manage sessions. |
| Customer Onboarding | `/onboarding` | **Missing** | No guided setup (Org -> Provider Key -> SpendGuard Key). |
| Organization Settings | `/settings` | **Missing** | No place to configure billing, members, or SSO. |
| Dashboard Core | `/dashboard` | Functional | All 8 tabs wired to backend proxy routes. |
| Marketing Landing | `/` | Functional | Content-complete, Orange + White design system. |

### 4.2 Legacy Artifacts
- `client/lib/db.ts` (28KB) and `client/lib/gateway-service.ts` (15KB): Legacy client-side simulation modules from prototype v1.0. These are no longer called by dashboard views and should be safely deprecated or removed.
- `client/data/spendguard-store.json` (186KB): Static prototype seed store.

---

## 5. Verification & Testing Status

| Verification Target | Test Harness | Result | Notes |
|---|---|---|---|
| AES-256-GCM Envelope Encryption | `server/test/run-tests.ts` | **PASS** | Roundtrip encryption, IV, and tag verified. |
| API Key Masking (`sk-...7890`) | `server/test/run-tests.ts` | **PASS** | Proper PRD format enforced. |
| Gateway Virtual Key Generation | `server/test/run-tests.ts` | **PASS** | `sg_live_*` prefix and peppered SHA-256 hash. |
| Multi-Provider Pricing Engine | `server/test/run-tests.ts` | **PASS** | GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro exact match. |
| Statistical Anomaly Detection | `server/test/run-tests.ts` | **PASS** | Normal baseline passes; 88.9x spike triggers flag. |
| Live PostgreSQL Migrations | CLI / Prisma | **Untested** | Needs live DB connection test. |
| Live Redis Budget Lua Reservation | Redis Service | **Missing** | Requires atomic Lua script implementation. |
| Real Upstream Provider Calls | Gateway Adapters | **Partially Verified** | Upstream calls supported if keys provided in `.env`. |
| Stripe Webhook Signature Test | Billing Module | **Untested** | Requires Stripe CLI / test mode secrets. |

---

## 6. Audit Conclusion & Next Actions

The codebase has strong foundations in encryption, pricing, and analytics architecture, but requires immediate remediation in:
1. Enforcing `@UseGuards(JwtAuthGuard)` across all backend controllers with organization tenant scoping.
2. Building customer authentication & onboarding UI pages in `client/app/`.
3. Upgrading budget checks to atomic Redis reservation scripts.
4. Installing `stripe` and replacing stub billing with live test-mode checkout and signature-verified webhooks.
5. Eliminating mock fallback synthesis in the gateway adapters in favor of standardized HTTP errors.

