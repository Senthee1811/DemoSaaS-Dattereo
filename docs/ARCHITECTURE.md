# SpendGuard AI — Production System Architecture & Design Specification (Phase 0)

**Version**: 2.0.0-PROD  
**Date**: 2026-11-09  
**Target**: Commercial Multi-Tenant AI Spend Governance Platform  

---

## 1. System Topology & Monorepo Architecture

SpendGuard AI is architected as a high-performance **modular monolith** with clean client/server separation:

```mermaid
flowchart TB
    subgraph ClientApp ["Client Application (client/ - Next.js 15)"]
        Landing["Marketing Website & Pricing\n(App Router /)"]
        AuthViews["Auth & Onboarding\n(/login, /register, /onboarding)"]
        Dashboard["Customer FinOps Dashboard\n(/dashboard - 8 Nav Sections)"]
        BFF["Next.js Route Handlers (BFF)\n(client/app/api/*)"]
    end

    subgraph CoreBackend ["Core Platform (server/ - NestJS 10)"]
        GatewayCtrl["Gateway Controller\nPOST /v1/chat/completions"]
        ModulesCtrl["Management Controllers\n(/projects, /keys, /alerts, /team)"]
        BillingCtrl["Billing Controller\n(/billing/checkout, /webhook)"]
        
        AuthMod["Auth & RBAC Module"]
        KeyVault["AES-256 Key Vault Module"]
        BudgetEngine["Atomic Budget Engine"]
        PriceEngine["Model Pricing Engine"]
        AnomalyEngine["Statistical Z-Score Engine"]
        AuditEngine["Immutable Audit Engine"]
    end

    subgraph DataPlane ["Persistence & Caching Tier"]
        Postgres[("PostgreSQL\nPersistent Data & Audit Ledger")]
        RedisDB[("Redis Cluster\nAtomic Budgets, Rate Limits, Cache")]
        BullMQWorkers[("BullMQ Queue\nAsync Reconcile, Notifications")]
    end

    subgraph UpstreamAI ["External AI Provider APIs"]
        OpenAI["OpenAI API\n(GPT models)"]
        Anthropic["Anthropic Claude API\n(Claude models)"]
        Gemini["Google Gemini API\n(Gemini models)"]
        StripeAPI["Stripe API\n(Subscriptions & Invoices)"]
    end

    Landing --> AuthViews --> Dashboard
    Dashboard --> BFF
    BFF -->|HTTP/REST Proxy| GatewayCtrl
    BFF -->|HTTP/REST Proxy| ModulesCtrl
    BFF -->|HTTP/REST Proxy| BillingCtrl

    GatewayCtrl --> AuthMod
    GatewayCtrl --> BudgetEngine
    GatewayCtrl --> KeyVault
    GatewayCtrl --> PriceEngine

    KeyVault -->|Decrypted Secret| UpstreamAI
    BudgetEngine <-->|Atomic Lua Scripts| RedisDB
    ModulesCtrl --> Postgres
    PriceEngine --> Postgres
    AnomalyEngine --> Postgres
    AuditEngine --> Postgres
    BillingCtrl --> StripeAPI
    BillingCtrl --> Postgres

    GatewayCtrl -.->|Async Job| BullMQWorkers
    BullMQWorkers -.->|Reconcile Spend| RedisDB
    BullMQWorkers -.->|Dispatch Alerts| Postgres
```

---

## 2. End-to-End Request Lifecycle (AI Gateway)

Every inference call through the unified endpoint `POST /v1/chat/completions` undergoes strict pre-flight governance, atomic reservation, upstream dispatch, and post-flight reconciliation:

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer / AI Agent
    participant GW as SpendGuard Gateway Proxy
    participant Auth as Key & RBAC Validator
    participant Red as Redis (Atomic Guardrail)
    participant Vlt as Encrypted Key Vault
    participant AI as Upstream Provider (OpenAI/Anthropic/Gemini)
    participant Anom as Anomaly Engine
    participant DB as PostgreSQL (Immutable Ledger)

    Dev->>GW: POST /v1/chat/completions (Bearer sg_live_...)
    GW->>Auth: Hash token (SHA-256) & lookup permissions
    alt Key Invalid, Expired, or Model Not Allowed
        Auth-->>Dev: 401 Unauthorized / 403 Forbidden
    end

    GW->>Red: Atomic Lua Check: (currentSpend + reserved + estimatedCost <= budgetCap)
    alt Redis Unreachable (Fail-Closed)
        Red-->>GW: Connection Error
        GW-->>Dev: 503 Service Unavailable (governance_unavailable)
    else Budget Exceeded
        Red-->>GW: Capacity Exceeded
        GW->>DB: Log Blocked Attempt (statusCode: 429)
        GW-->>Dev: 429 Too Many Requests (budget_exceeded)
    else Capacity Available
        Red-->>GW: Reservation Confirmed (increment reserved_key)
    end

    GW->>Vlt: Retrieve & Decrypt Provider Key (AES-256-GCM)
    Vlt-->>GW: Plaintext Key (in-memory only)
    
    GW->>AI: Forward Request with Provider Key
    AI-->>GW: Inference Response + Token Usage Metadata

    GW->>Red: Reconcile: Decrement reserved_key, Increment spend_key
    GW->>Anom: Evaluate Z-Score against 40 rolling requests
    opt Z-Score >= 3.0 (Anomaly Spike)
        Anom->>DB: Record BudgetAlert (threshold: ANOMALY_DETECTED)
    end

    GW->>DB: Async Insert Request & AuditLog (immutable)
    GW-->>Dev: OpenAI-Compatible Response + Governance Headers
```

---

## 3. Security & Cryptographic Architecture

### 3.1 Two-Tier Envelope Encryption (Provider Keys)
External provider credentials (e.g. OpenAI `sk-...`, Anthropic `sk-ant-...`, Gemini keys) are secured using envelope encryption to prevent exposure even in the event of database exfiltration:
- **Master Encryption Key (`ENCRYPTION_MASTER_KEY`)**: 32-byte secret sourced exclusively from environment variables or AWS Secrets Manager. Never stored in the database.
- **Data Key & Payload**:
  1. Generate 16-byte cryptographically secure random IV: `crypto.randomBytes(16)`.
  2. Encrypt plaintext provider key with AES-256-GCM.
  3. Obtain 16-byte authentication tag: `cipher.getAuthTag()`.
  4. Serialized format: `env:v1:<iv>:<authTag>:<encryptedPayload>`.
- **Zero Plaintext Exposure**: Plaintext keys are decrypted only in-memory at the moment of provider dispatch. API endpoints return only the sanitized `maskedPreview` (`sk-...7890`).

### 3.2 Gateway Virtual Keys (`sg_live_*`, `sg_test_*`)
Customer-facing SpendGuard keys are generated with secure random entropy:
- `secret`: `sg_live_` + 32-byte hex string (displayed to customer **exactly once** upon creation).
- `keyPrefix`: `sg_live_` + first 4 characters.
- `hashedSecret`: `crypto.createHmac('sha256', PEPPER).update(secret).digest('hex')`.
- The database stores **only** `hashedSecret`. Even with full read access to PostgreSQL, no active gateway keys can be reconstructed.

### 3.3 User Password Security
- User passwords are salted with 32 random bytes and hashed via **PBKDF2-HMAC-SHA512** (100,000 iterations), formatted as `$pbkdf2$<salt>$<hash>`.

---

## 4. Multi-Tenant Data Model (PostgreSQL / Prisma)

```mermaid
erDiagram
    ORGANIZATION ||--o{ USER : "has members"
    ORGANIZATION ||--o{ PROJECT : "contains"
    ORGANIZATION ||--o| SUBSCRIPTION : "billed via"
    
    PROJECT ||--o{ PROVIDER_API_KEY : "stores"
    PROJECT ||--o{ GATEWAY_API_KEY : "issues"
    PROJECT ||--o{ REQUEST : "meters"
    PROJECT ||--o{ BUDGET_ALERT : "triggers"
    PROJECT ||--o| ALERT_CONFIG : "configures"

    REQUEST ||--o| AUDIT_LOG : "generates"
    USER ||--o{ REQUEST : "initiates"

    ORGANIZATION {
        string id PK
        string name
        string slug UK
        datetime created_at
    }

    SUBSCRIPTION {
        string id PK
        string org_id FK,UK
        string stripe_customer_id UK
        string stripe_subscription_id UK
        string tier
        string status
        datetime current_period_end
    }

    USER {
        string id PK
        string org_id FK
        string email UK
        string password_hash
        string role "OWNER | ADMIN | MEMBER"
    }

    PROJECT {
        string id PK
        string org_id FK
        string name
        string slug
        decimal budget_monthly
        boolean budget_hard_block_enabled
        boolean is_blocked
    }

    PROVIDER_API_KEY {
        string id PK
        string project_id FK
        string provider "OPENAI | ANTHROPIC | GEMINI"
        string encrypted_key
        string masked_preview
        boolean is_active
    }

    GATEWAY_API_KEY {
        string id PK
        string project_id FK
        string key_prefix
        string hashed_secret UK
        int rate_limit_rpm
        string allowed_models
        boolean is_active
    }

    REQUEST {
        string id PK
        string project_id FK
        string user_id FK
        string provider
        string model
        int tokens_in
        int tokens_out
        int total_tokens
        decimal cost_estimate
        int latency_ms
        boolean is_anomaly
        boolean is_blocked
        datetime created_at
    }

    BUDGET_ALERT {
        string id PK
        string project_id FK
        string threshold_type "PERCENT_80 | HARD_BLOCK | ANOMALY_DETECTED"
        string title
        string message
        boolean is_read
        datetime triggered_at
    }

    AUDIT_LOG {
        string id PK
        string request_id FK
        string actor
        string action
        string metadata
        datetime created_at
    }
```

---

## 5. Budget State Machine & Guardrail Policies

```mermaid
stateDiagram-v2
    [*] --> Healthy: Project Initialized

    Healthy --> SoftWarning: Spend >= 80% of Monthly Budget
    note right of SoftWarning
        Trigger idempotent in-app & Slack notification.
        Traffic continues uninterrupted.
    end note

    SoftWarning --> Healthy: Budget Increased or Month Rollover
    SoftWarning --> HardBlocked: Spend >= 100% of Monthly Budget
    
    Healthy --> HardBlocked: Single Spike Breaches 100%
    note right of HardBlocked
        Project marked is_blocked = true.
        Subsequent requests fail with HTTP 429.
    end note

    HardBlocked --> Healthy: Admin Increases Budget / Unblocks

    state "Fail-Closed Active" as FailClosed
    Healthy --> FailClosed: Redis Connection Lost
    SoftWarning --> FailClosed: Redis Connection Lost
    note right of FailClosed
        Fail-Closed Governance:
        No traffic allowed without verified budget check.
        Returns HTTP 503 governance_unavailable.
    end note
    FailClosed --> Healthy: Redis Reconnected
```

---

## 6. Billing Domain Isolation Architecture

To ensure platform reliability and zero cross-contamination:
- **No Shared Services**: `BillingService` and `BillingController` operate in an independent domain from `GatewayService` and `PricingService`.
- **Database Boundary**: `Subscription` links strictly to `Organization` via `orgId`. It contains **no foreign keys or queries** into `Request`, `ModelPricing`, or `ProviderApiKey`.
- **Failure Isolation**: A Stripe API outage or webhook delay will **never impact LLM inference latency** or block API proxy traffic.

---

## 7. Production Deployment Specification

| Service Layer | Technology | Recommended Cloud Target | Sizing / Redundancy |
|---|---|---|---|
| **Frontend / BFF** | Next.js 15 App Router | Vercel Enterprise | Global Edge Network, multi-region failover |
| **API Gateway Core** | NestJS 10 (Docker) | AWS ECS Fargate / GCP Cloud Run | Min 2 replicas, autoscaling on CPU/Latency |
| **Background Worker** | NestJS BullMQ Worker | AWS ECS Fargate (Worker process) | 1-2 worker tasks independent of API |
| **Relational Database**| PostgreSQL 16 | Neon / AWS RDS Aurora PostgreSQL | Multi-AZ, automated daily snapshots |
| **Budget & Rate Cache**| Redis 7.2 | Upstash Redis / AWS ElastiCache | In-memory persistence, sub-5ms latency SLA |
| **Object Storage** | AWS S3 Compatible | Cloudflare R2 / AWS S3 | Encrypted audit log CSV exports |
| **Ingress & Security** | Cloudflare | Cloudflare Enterprise | DDoS protection, TLS 1.3, strict rate limiting |

