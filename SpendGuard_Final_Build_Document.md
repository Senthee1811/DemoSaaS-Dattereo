# SpendGuard AI — Production Build Instructions
**For: AI coding agent building the final product (not the prototype)**
**Reference: AI Spend Governance Platform PRD v2.0 · Current prototype: https://demosaas-seven.vercel.app**

---

## 0. Read this first

Everything currently live at `demosaas-seven.vercel.app` — the marketing site, the interactive "sandbox" demo, and the dashboard shell — is a **prototype**. Its data is simulated: budgets, spend numbers, gateway responses, and audit entries are hardcoded or client-side scripted, not backed by a real database or a real proxy to OpenAI/Gemini/Claude.

Your job is to replace every simulated piece with a real, working, production-grade system while preserving:
- The existing UI/UX and Orange + White design system exactly as built
- The monorepo structure: `client/` (Next.js, frontend only) and `server/` (NestJS, backend only) — never cross-modify
- The PRD's functional requirements, non-functional requirements, and phase scoping exactly as written

Do not rebuild the frontend from scratch. Wire it to a real backend and fix any remaining visual bugs. Build the backend from scratch per Section 3 below.

---

## 1. Non-negotiable principles (apply to every step)

1. **Fail-closed is mandatory.** If Redis or any dependency the budget-check relies on is unreachable, the gateway must block the request and return a governance error — never silently allow it through.
2. **Aggregation endpoints must never return `null`/`undefined`/empty-without-shape.** A project with zero requests must return `{ totalSpend: 0, byModel: [] }`, not nothing. This is the direct fix for the prototype's `$NaN` bug — it must be fixed at the API layer, not patched over in the frontend.
3. **Platform billing (Stripe) is fully isolated from the AI-provider cost engine.** No shared code, no shared tables beyond `organizations`. A bug in one must never be able to touch the other.
4. **PRD phasing must be respected everywhere, including marketing copy.** Anomaly detection is Phase 3. SSO/SAML/SCIM and self-hosted deployment are Phase 4. Until built, the Enterprise pricing tier must not offer them for self-serve checkout — either remove them from the tier, mark them "Roadmap," or force Enterprise signups through a manual "Contact Sales" flow.
5. **Palette stays centralized.** All colors pull from the shared Tailwind config (`#FF6B35` primary orange, `#FF8A4C` secondary, `#FFF1EA` light, `#FFFFFF` background, plus the rest of the established design system) — no hardcoded hex values in components, and the dashboard must visually match the marketing site.
6. **API keys are encrypted at rest, always.** No plaintext provider key is ever stored, logged, or returned by any endpoint after initial creation.
7. **Audit log entries are immutable.** Once written, a request/audit row cannot be updated — only inserted or exported.

---

## 2. Step-by-step build sequence

### Step 1 — Environment & foundations
1. In `server/`, initialize a NestJS project (if not already scaffolded as a shell).
2. Set up environment config with `@nestjs/config` and a validated schema (`class-validator` or `zod`) — the app must refuse to start if a required env var is missing (DB URL, Redis URL, JWT secret, encryption master key, provider API base URLs).
3. Set up PostgreSQL (recommend Neon for parity with the PRD's deployment target) and Redis (recommend Upstash).
4. Set up BullMQ connected to Redis for async job processing.
5. Add structured logging (pino or winston) — no `console.log` in production code paths.
6. Add a `/health` endpoint that checks DB and Redis connectivity and returns a real status, not a hardcoded 200.

### Step 2 — Database schema & first migration
Create the Prisma schema exactly as follows (matches PRD Section 7, extended with fields needed for auth, RBAC, and billing isolation). Place this in `server/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  OWNER
  ADMIN
  MEMBER
}

enum Provider {
  OPENAI
  GEMINI
  CLAUDE
}

enum ThresholdType {
  SOFT_WARNING
  HARD_BLOCK
}

enum AlertChannel {
  EMAIL
  SLACK
}

model Organization {
  id              String    @id @default(cuid())
  name            String
  createdAt       DateTime  @default(now())
  users           OrgMembership[]
  projects        Project[]
  subscription    Subscription?
}

model User {
  id              String    @id @default(cuid())
  email           String    @unique
  passwordHash    String
  createdAt       DateTime  @default(now())
  memberships     OrgMembership[]
  requests        Request[]
}

model OrgMembership {
  id              String    @id @default(cuid())
  userId          String
  orgId           String
  role            Role
  user            User          @relation(fields: [userId], references: [id])
  organization    Organization  @relation(fields: [orgId], references: [id])

  @@unique([userId, orgId])
}

model Project {
  id              String    @id @default(cuid())
  orgId           String
  name            String
  budgetMonthly   Decimal   @db.Decimal(12, 4)
  createdAt       DateTime  @default(now())
  organization    Organization  @relation(fields: [orgId], references: [id])
  apiKeys         ApiKey[]
  requests        Request[]
  budgetAlerts    BudgetAlert[]

  @@index([orgId])
}

model ApiKey {
  id              String    @id @default(cuid())
  projectId       String
  provider        Provider
  encryptedKey    String    // envelope-encrypted ciphertext, never plaintext
  maskedPreview   String    // e.g. "sk-...ab12", safe to display
  createdAt       DateTime  @default(now())
  rotatedAt       DateTime?
  project         Project   @relation(fields: [projectId], references: [id])

  @@index([projectId])
}

model Request {
  id              String    @id @default(cuid())
  projectId       String
  userId          String
  provider        Provider
  model           String
  tokensIn        Int
  tokensOut       Int
  costEstimate    Decimal   @db.Decimal(12, 6)
  timestamp       DateTime  @default(now())
  project         Project   @relation(fields: [projectId], references: [id])
  user            User      @relation(fields: [userId], references: [id])
  auditLog        AuditLog?

  @@index([projectId, timestamp])
  @@index([userId])
}

model BudgetAlert {
  id              String        @id @default(cuid())
  projectId       String
  thresholdType   ThresholdType
  thresholdValue  Decimal       @db.Decimal(12, 4)
  triggeredAt     DateTime      @default(now())
  channel         AlertChannel
  project         Project       @relation(fields: [projectId], references: [id])

  @@index([projectId])
}

model AuditLog {
  id              String    @id @default(cuid())
  requestId       String    @unique
  actor           String
  action          String
  metadata        Json
  createdAt       DateTime  @default(now())
  request         Request   @relation(fields: [requestId], references: [id])
}

// Isolated billing domain — no relation into cost-engine tables beyond Organization
model Subscription {
  id                    String    @id @default(cuid())
  orgId                 String    @unique
  stripeCustomerId      String    @unique
  stripeSubscriptionId  String?   @unique
  tier                  String    // "starter" | "growth" | "enterprise"
  status                String    // Stripe subscription status
  currentPeriodEnd      DateTime?
  organization          Organization @relation(fields: [orgId], references: [id])
}
```

3. Run and commit the first migration:
   ```bash
   npx prisma migrate dev --name init
   ```
4. Confirm a fresh clone + `npx prisma migrate deploy` produces a working database with no manual steps.
5. Seed script: create one demo organization, one demo project, and a demo owner user for local development and QA.

### Step 3 — Auth & Organizations (FR1)
1. Implement JWT auth (access + refresh tokens), password hashing with argon2.
2. Implement `OrgMembership`-based RBAC guards (`@Roles('OWNER', 'ADMIN')` style decorators).
3. Write a test proving a member of Org A cannot read or act on Org B's projects, keys, or requests even with a valid token.

### Step 4 — Encrypted Key Vault (FR2)
1. Implement envelope encryption: a data key encrypts each provider API key; the data key itself is encrypted with a master key sourced from environment/secrets manager, never hardcoded.
2. On key creation, return only the `maskedPreview` (e.g. `sk-...ab12`) — the plaintext is never returned again by any endpoint.
3. Implement key rotation without downtime for in-flight requests.
4. Write a dedicated test suite for this module — it is the highest-risk surface in the system.

### Step 5 — Gateway & provider adapters (FR3)
1. Define a common `ProviderAdapter` interface: `send()`, `estimateCost()`, `supportsStreaming()`.
2. Implement concrete adapters for OpenAI, Gemini, and Claude.
3. Design so a new provider requires zero changes to the governance/budget layer.
4. Support both streaming and non-streaming responses from the start.
5. This replaces the prototype's simulated "Simulate Next Request" button with a real proxied call.

### Step 6 — Usage & Cost Engine (FR4)
1. Log every request asynchronously via BullMQ into the `Request` table — never block the response on this write.
2. Maintain a versioned, externally-configurable pricing table per provider/model (not hardcoded inline) so price changes don't require a redeploy.
3. For streaming responses, finalize token count and cost only once the stream closes, then reconcile the Redis spend counter.

### Step 7 — Budget & Alerts — the critical path (FR5, FR7, FR10)
1. Maintain Redis-cached spend counters per project, checked **synchronously, before** proxying any request to a provider.
2. Hard-block: if the check fails, return a governance error and do not call the provider.
3. Fail-closed: if Redis is unreachable, block the request and return a governance error — do not fall back to allowing it.
4. Async BullMQ reconciliation job: periodically recompute true spend from the `Request` table and correct any Redis drift.
5. Alert dispatch (email/Slack) on soft-warning and hard-block thresholds, idempotent per threshold crossing (must not refire on every subsequent request once already breached).

### Step 8 — Audit (FR4, FR8)
1. Enforce that `AuditLog` rows are append-only — no update method should exist in the service layer, and restrict UPDATE at the DB role level if your Postgres provider supports it.
2. Build a paginated/streamed CSV export endpoint (do not load the full table into memory for large orgs).

### Step 9 — Analytics Dashboard API (FR6)
1. Build aggregation endpoints (spend-over-time, per-model, per-user) computed via scheduled BullMQ jobs into pre-aggregated tables — not live full-table scans on every dashboard load.
2. Every endpoint must return well-formed zero-state results for empty date ranges — this directly fixes the prototype's `$NaN` and blank-chart bugs at the source.
3. Support near-real-time refresh via WebSocket or short-poll SSE.

### Step 10 — Anomaly Detection (FR9, Phase 3)
1. Implement a statistical (not ML) flag — e.g. z-score against a rolling window of per-project usage.
2. If not fully implemented before launch, update the pricing page to mark this as "Roadmap" rather than currently available, per Principle 4.

### Step 11 — Platform billing (Stripe)
1. Add a `Subscription` model (already in the schema above) tied 1:1 to `Organization`.
2. Implement Stripe Checkout for the three published tiers (Starter/Growth/Enterprise) and webhook handling for subscription lifecycle events (created, updated, payment failed, canceled).
3. Keep this module's code fully separate from the cost-engine module — no shared services, no shared business logic, only the `Organization` foreign key in common.

### Step 12 — Frontend wiring (`client/`)
1. Replace every mocked/hardcoded value in the dashboard (`Spend Analytics`, `Projects & Budgets`, `Key Vault & Gateway`, `Gateway Test Bench`, `Audit Trail & Ledger`, `Alerts & Anomalies`, `Integration & SDK`, `Team & RBAC`) with real calls to the endpoints built above.
2. Apply a single reusable `<EmptyState />` and `<LoadingSkeleton />` component across every stat card, chart, and table — test each screen at zero-data, sparse-data, and full-data states.
3. Fix the sidebar footer overlap (notification badge clipping the Guardrail Status card) — move to a portal/toast pattern.
4. Confirm the dashboard's color theme exactly matches the marketing site's Orange + White system — no leftover navy/cyan.
5. On the marketing page, clearly label the interactive "sandbox" as a simulation unless/until it is wired to call the real gateway.

### Step 13 — Security & observability hardening
1. Rate limiting on the gateway endpoint.
2. Input validation (`class-validator`) on every DTO.
3. Scrub API keys and other secrets from all log output.
4. Request-ID traceable structured logs end-to-end.
5. Basic metrics (request count, error rate, latency) exposed for scraping.
6. OpenAPI/Swagger auto-generated from NestJS decorators so the frontend team can consume the API without reading source.

### Step 14 — Pre-launch end-to-end verification
Run this full flow against the real system (not the prototype) and confirm every step works exactly as described:
1. Create an organization → add a project → connect a real provider API key.
2. Send a request through the gateway → confirm it's logged with an accurate cost estimate.
3. Cross the soft-warning threshold → confirm a real email/Slack alert fires.
4. Cross the hard-block threshold → confirm the next request is actually blocked with a governance error, not just visually flagged.
5. Export the audit log as CSV → confirm it matches the logged requests exactly.
6. Confirm the dashboard reflects all of the above in near real time without manual refresh.
7. Confirm every item in the PRD's Section 9 "Success Criteria" passes against this real flow.

---

## 3. Definition of done

The product is production-ready when:
- Every FR1–FR11 from the PRD is backed by real logic, not simulated/hardcoded data
- The pricing page only offers self-serve checkout for features that actually exist (Principle 4)
- No dashboard screen can render `NaN`, blank, or overlapping UI under any data condition
- Fail-closed behavior is provably correct (test by taking Redis offline and confirming requests are blocked, not allowed)
- API keys never appear in plaintext anywhere outside the encryption boundary
- The audit log is provably immutable (attempted updates are rejected)
- A fresh database, built only from committed Prisma migrations, produces a fully working system