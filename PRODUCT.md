# SpendGuard AI — Product Context & Specifications

## 1. Product Identity
- **Product Name**: SpendGuard AI
- **Category**: AI FinOps & Multi-Provider AI Gateway Infrastructure
- **Tagline**: Developer-first governance, atomic budget enforcement, and unified gateway routing for engineering teams.
- **Tone**: Precise, authoritative, operational, technical, restrained.

## 2. Target Personas
1. **AI Infrastructure Engineers & Tech Leads**:
   - Needs: Drop-in unified OpenAI/Anthropic/Gemini SDK proxy, sub-5ms latency overhead, reliable rate-limiting, and zero developer friction.
   - Key Workflows: Creating virtual gateway keys (`sg_live_*`), testing upstream provider connections, debugging request latencies in the gateway test bench.
2. **FinOps & Engineering Managers**:
   - Needs: Hard monthly and weekly budget limits that cannot be bypassed by parallel agent loops; automated alerts before overspending occurs.
   - Key Workflows: Assigning dollar caps per project, configuring Slack/Email webhook alerts at 80% and 100% thresholds, reviewing monthly burn.
3. **Finance & Compliance Leaders (SOC2 / CFO)**:
   - Needs: Cryptographically sealed immutable audit ledger, exact token attribution per department, and seamless CSV exports.
   - Key Workflows: Downloading monthly audit logs, verifying tenant data isolation, reviewing Stripe subscription invoices.

## 3. Core Operational Workflows
1. **Self-Serve Onboarding**:
   - Register organization -> Connect upstream provider API keys (OpenAI, Anthropic, Gemini) with live ping verification -> Set first project budget -> Receive scoped virtual gateway key (`sg_live_*`).
2. **Gateway Request Lifecycle**:
   - Client sends OpenAI-compatible request to `https://gateway.spendguard.ai/v1/chat/completions`.
   - Redis executes atomic Lua pre-flight capacity reservation (worst-case token cost).
   - If over budget: Immediately fail closed with HTTP 429 `budget_exceeded`.
   - If healthy: Forward request to upstream provider with 60-second timeout abort.
   - On completion: Reconcile actual token cost, credit unused reservation back to Redis, and log immutable audit record.
3. **Statistical Anomaly Detection (FR-9)**:
   - Dynamic Z-score analysis of token usage and spend compared against project moving averages.
   - Automatic flagging of abnormal inference spikes (>3.0 Z-score) and instantaneous Slack/Webhook notification.
4. **Subscription Management**:
   - Tiered plans: Starter ($39/mo), Growth ($199/mo), Enterprise ($799/mo / custom VPC deployment).
   - Stripe Checkout and signature-verified webhook lifecycle.

## 4. Architecture & Technical Foundation
- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Lucide Icons, Recharts.
- **Backend**: NestJS 10 modular monolith, Prisma ORM, PostgreSQL 16, Redis 7 (ioredis), BullMQ.
- **Security**: AES-256-GCM envelope encryption for upstream credentials, salted SHA-256/Argon2 hashing for virtual gateway keys, strict tenant isolation on every SQL query (`orgId`).
