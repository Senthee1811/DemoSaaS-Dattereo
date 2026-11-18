# SpendGuard AI — Product Identity & Architecture (Dattreo Studio)

## 1. Product Summary & Identity

- **Product Name**: SpendGuard AI
- **Category**: AI FinOps / LLM Usage Management / Cost Intelligence / Multi-Model AI Gateway
- **Brand & Studio**: Dattreo ([www.dattreo.com](https://www.dattreo.com))
- **Mission**: Provide engineering, FinOps, and leadership teams with complete cost transparency, sub-5ms pre-flight budget guardrails, and cryptographic auditability across multi-provider LLM infrastructure (OpenAI, Anthropic Claude, Google Gemini).

## 2. Target Personas

1. **AI Infrastructure Engineers & Tech Leads**:
   - Needs: Drop-in SDK compatibility (OpenAI `/v1/chat/completions`), sub-5ms proxy overhead, reliable fail-closed behavior, zero prompt retention, automated key rotation.
2. **FinOps & Engineering Managers**:
   - Needs: Real-time spend attribution per team/project, hard budget caps preventing runaway overages, statistical anomaly detection (3-sigma spikes), automated Slack/Email alerts.
3. **CFO, Finance & Compliance Officers**:
   - Needs: Immutable audit trails with cryptographically verifiable timestamps and cost metrics, SOC2-ready CSV exports, centralized Stripe subscription management.

## 3. Two Coordinated Design Directions

SpendGuard AI unifies two complementary, premium design languages under the **Dattreo brand identity**:

### Direction A: Authenticated Application — Steep Editorial Analytics
- **Visual Personality**: High-end editorial financial intelligence workspace rather than conventional SaaS dashboard chrome.
- **Typography**: Refined serif display headings (Source Serif 4 / Georgia) combined with minimalist sans-serif interface typography (Inter) and monospace data tokens.
- **Surfaces**: Pure crisp white (`#FFFFFF`) canvas, soft neutral secondary surfaces (`#F4F4F3`), and restrained warm Dattreo orange tints (`#FFF7F2`).
- **Geometry**: 24px content card radius (`rounded-[24px]`), 16px small card/input radius (`rounded-2xl`), pill-shaped interactive buttons (`rounded-full`), hairline neutral borders (`#E4E4E0`), and subtle elevation.
- **Data Visualizations**: Prominent spending summaries, compact budget utilization indicators, multi-model time-series velocity charts, structured provider cost tables, and tabular numerals (`tabular-nums`) across all financial figures.

### Direction B: Public Marketing Website — Anthropic-Inspired Editorial Design
- **Visual Personality**: Sophisticated editorial technology publication. Thoughtful, authoritative, technical, and restrained.
- **Typography**: Large editorial serif headlines (Source Serif 4, 48–68px display), clean sans-serif controls (16–20px body), and small technical monospace badges (12px).
- **Surfaces**: Warm parchment-inspired palette — warm ivory canvas (`#FAF8F5`), oat-toned secondary sections (`#EFECE6`), manilla-accented features (`#F5EFEB`), and an authoritative near-black inversion footer (`#141413`).
- **Button Geometry**: Pill-shaped and selective bottom-corner radii on filled buttons for an unmistakably art-directed feel.
- **Compositions**: Asymmetric hero layouts, live interactive gateway sandbox, editorial two-column technical storytelling, transparent pricing tiers (Starter, Growth, Enterprise), and technical architecture explanations.

## 4. Dattreo Brand Palette Integration

- **Primary Brand Orange**: `#FF6B35` (Dattreo Brand Orange)
- **Primary Hover**: `#E55A25`
- **Subtle Tint Surface**: `#FFF7F2` / `#FFF5F0`
- **Hairline Border (Light)**: `#FFD2C0` (Warm Orange) / `#E4E4E0` (Neutral)
- **Neutral Canvas (Dashboard)**: `#FFFFFF`
- **Parchment Canvas (Marketing)**: `#FAF8F5`
- **Deep Inversion (Footer & Code Blocks)**: `#141413`
- **Text Primary**: `#18191B`
- **Text Secondary**: `#5F6368`
- **Chart Model Palette**:
  - GPT-4o: `#FF6B35` (Dattreo Orange)
  - Claude 3.5 Sonnet: `#2563EB` (Cobalt Blue)
  - Gemini 1.5 Pro: `#0D9488` (Teal)
  - Other / Aggregated: `#7C3AED` (Purple)

## 5. Architectural & Governance Invariants

1. **Sub-5ms Atomic Redis Lua Budget Enforcement**:
   - Evaluates project budget reservations atomically before dispatching outbound requests to upstream AI providers.
   - Returns immediate HTTP 429 when budget is exceeded.
2. **Fail-Closed Disaster Policy**:
   - If Redis or networking dependencies degrade, the gateway fails closed with HTTP 503 rather than allowing unmetered spend leaks.
3. **Envelope AES-256-GCM Key Encryption**:
   - Raw provider keys are encrypted with unique per-organization data keys and master environment keys. Plaintext keys never leave the encryption boundary.
4. **Zero Prompt Retention**:
   - Raw prompt payloads and model completions are streamed directly without being written to disk or audit logs. Only telemetry metadata is preserved.
5. **Multi-Tenant Data Boundary**:
   - Every database query strictly isolates records by `orgId`.
