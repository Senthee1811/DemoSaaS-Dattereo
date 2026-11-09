# SpendGuard AI — Design System & Visual Specification
## Direction: "Developer FinOps Precision"

### 1. Philosophy & Aesthetic Intent
SpendGuard AI is a mission-critical financial operations and infrastructure gateway for AI engineering teams. Its interface must project:
- **Financial Rigor**: Tabular figures, accurate decimal places, precise currency accounting, no ambiguity.
- **Operational Clarity**: High signal-to-noise ratio, zero decorative fluff, clear semantic status indicators.
- **Developer Familiarity**: Density inspired by high-leverage developer tools (Stripe, Cloudflare, Linear, GitHub), clean monospace typography for identifiers, instant keyboard navigation.
- **Anti-AI-Slop Restraint**: Eliminates generic SaaS clichés (purple/neon gradient blobs, floating glassmorphic frosted cards, oversized bubbly corner radii, marketing hyperbole).

---

### 2. Color System & Semantic Tokens

| Token | Hex Value | Purpose & Usage Rule |
| :--- | :--- | :--- |
| **Canvas Background** | `#FBFBFA` | Warm, subtle off-white that reduces eye strain compared to blinding #FFF. |
| **Primary Surface** | `#FFFFFF` | Card backgrounds, table bodies, modal sheets. Elevated cleanly with 1px border. |
| **Secondary Surface** | `#F3F3F0` | Table headers, muted badge backdrops, subtle button backgrounds. |
| **Border / Divider** | `#E4E4E0` | Restrained neutral border. Clean 1px separation, never thick or decorative. |
| **Text Primary** | `#18191B` | High-contrast body, table values, headings. WCAG AAA compliant. |
| **Text Secondary** | `#5F6368` | Descriptive captions, table column headers, helper labels. |
| **Text Muted** | `#80868B` | Timestamps, inactive states, hints. |
| **Brand Orange** | `#FF6B35` | Intentional accent. Used for primary CTA, active navigation item, and key visual anchor. |
| **Brand Orange Hover** | `#E85520` | State feedback on primary action buttons. |
| **Brand Subtle Light** | `#FFF5F0` | Subtle active item background or selected row highlight. |
| **Success (Green)** | `#0D9488` / `#F0FDF4` | Normal budget state, verified connections, completed invoices. |
| **Warning (Amber)** | `#D97706` / `#FFFBEB` | 80% budget consumption threshold, moderate latency alert. |
| **Critical (Red)** | `#DC2626` / `#FEF2F2` | Hard-block enforced (429), statistical anomaly detected, failed key. |

---

### 3. Typography & Numerical Hierarchy
- **Base Font Family**: System Sans-serif (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif`).
- **Monospace Family**: `"JetBrains Mono", "SF Mono", Consolas, Menlo, monospace` for API keys, tokens, endpoints, and request IDs.
- **Tabular Figures**: Every currency figure, percentage, token count, and latency metric **must** carry `tabular-nums` (`font-variant-numeric: tabular-nums;`) so numbers align vertically in tables.
- **Scale**:
  - Page Titles: `text-xl sm:text-2xl font-bold tracking-tight text-[#18191B]`
  - Section Headings: `text-sm sm:text-base font-semibold text-[#18191B]`
  - Table Headers: `text-[11px] font-semibold uppercase tracking-wider text-[#5F6368]`
  - Body Text: `text-xs sm:text-sm text-[#18191B]`
  - Data Values: `text-sm font-semibold text-[#18191B] font-mono tabular-nums`

---

### 4. Layout & Surface Geometry
- **Corner Radii (Anti-Slop Standard)**:
  - Buttons, Inputs, Selects: `rounded-md` (6px) or `rounded-lg` (8px).
  - Cards, Tables, Modals: `rounded-xl` (12px).
  - Badges & Status Pills: `rounded-md` (4px–6px).
  - **Forbidden**: `rounded-3xl` (24px) bubbly cards on serious data tables and control panels.
- **Elevation**:
  - `border border-[#E4E4E0]` + minimal shadow `shadow-[0_1px_2px_rgba(0,0,0,0.03)]`.
  - Avoid heavy 20px blur shadows, glowing aura rings, or multi-nested cards.
- **Density**:
  - Prefer tabular rows with `py-2.5 px-3.5` padding over sprawling cards for lists of items (projects, keys, members, invoices).
  - Information should be glanceable in a single screen without endless vertical scrolling.

---

### 5. Component Guidelines
- **Tables**:
  - Sticky header with `#F3F3F0` background and 1px border.
  - Hover row state `#FAF9F6`.
  - Right-aligned numeric and monetary columns.
- **Action Buttons**:
  - Primary: Solid `#FF6B35` with hover `#E85520`, clean white text, no neon glowing spread.
  - Secondary: Neutral white surface `#FFFFFF` with `#E4E4E0` border and `#18191B` text.
  - Destructive: Subdued red `#DC2626` hover state with confirmation step.
- **Code Snippets**:
  - Dark charcoal background `#1E1F22`, syntax highlights in warm amber/orange, copy action button in header.
- **Empty States**:
  - Clean dashed border `#E4E4E0`, neutral icon `#5F6368`, clear non-generic description, and immediate action button.
