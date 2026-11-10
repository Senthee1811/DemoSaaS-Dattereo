# SpendGuard AI — Master Design System Reference (`MASTER.md`)
**Brand & Studio**: Dattreo Studio ([www.dattreo.com](https://www.dattreo.com))  
**Engine**: Genjutsu Creative Interface Pipeline  
**Version**: 2.0.0 (Enterprise SaaS Revamp)

---

## 1. Design Theses

### Visual Thesis: *Quiet Financial Architecture*
> SpendGuard AI is not a consumer AI chatbot or a generic SaaS dashboard. It is mission-critical financial and operational infrastructure for engineering teams managing hundreds of thousands of dollars in LLM API spend.
>
> The aesthetic balances **editorial rigor** (Source Serif 4, generous whitespace, warm ivory marketing surfaces) with **clinical financial accuracy** (pure white console canvas, 24px cards, hairline neutral borders `#E4E4E0`, tabular numbers, and surgical Dattreo orange `#FF6B35` accents).

### Interaction Thesis: *Sub-5ms Financial Precision & Tactile Confidence*
> Every interaction communicates immediate clarity, safety, and operational control. Modals and drawers slide with restrained velocity (`cubic-bezier(0.16, 1, 0.3, 1)` in 240ms). Form fields provide real-time feedback without aggressive premature red error states. Sensitive operations (API key creation, budget cap updates, token revocations) employ explicit confirmations with tactile copy states.

---

## 2. Token Dictionary

### A. Color Palette

```css
/* Dattreo Brand Primaries */
--color-dattreo-orange: #FF6B35;
--color-dattreo-orange-hover: #E55A25;
--color-dattreo-orange-subtle: #FFF7F2;
--color-dattreo-orange-border: #FFD2C0;

/* Authenticated Console Canvas (Steep Editorial Analytics) */
--color-sg-canvas: #FFFFFF;
--color-sg-surface: #FFFFFF;
--color-sg-surface-muted: #F8F8F7;
--color-sg-surface-hover: #F1F1EF;
--color-sg-border: #E4E4E0;
--color-sg-border-light: #ECECE8;

/* Public Marketing Canvas (Anthropic Warm Editorial) */
--color-parchment-ivory: #FAF8F5;
--color-parchment-oat: #EFECE6;
--color-parchment-manilla: #F5EFEB;
--color-parchment-border: #E5E0D8;
--color-inversion-dark: #141413;

/* Text & Contrast Hierarchy */
--color-text-primary: #18191B;
--color-text-secondary: #5F6368;
--color-text-muted: #80868B;
--color-text-subtle: #9AA0A6;

/* Financial & Governance Semantic States */
--color-status-success: #0D9488;
--color-status-success-bg: #F0FDF4;
--color-status-success-border: #BBF7D0;

--color-status-warning: #D97706;
--color-status-warning-bg: #FFFBEB;
--color-status-warning-border: #FDE68A;

--color-status-danger: #DC2626;
--color-status-danger-bg: #FEF2F2;
--color-status-danger-border: #FECACA;

/* Multi-Provider Chart Palette */
--color-chart-openai: #FF6B35;
--color-chart-anthropic: #2563EB;
--color-chart-gemini: #0D9488;
--color-chart-aggregate: #7C3AED;
--color-chart-grid: #ECECE8;
```

---

## 3. Typography Scale & Fonts

SpendGuard AI utilizes three specialized typographic families:

1. **Display & View Headings**: **Source Serif 4** (Google Fonts: serif)
   - Used for view titles, section headers, hero statements, and big MTD currency displays.
   - `font-serif tracking-tight font-normal text-[#18191B]`.
2. **Interface & Controls**: **Inter** (Google Fonts: sans-serif)
   - Used for navigation links, buttons, form inputs, tooltips, and table headers.
   - `font-sans font-medium text-xs / text-sm`.
3. **Financial Data & Tokens**: **JetBrains Mono** (Google Fonts: monospace)
   - Used for `sg_live_*` tokens, API keys, JSON payloads, latency milliseconds, and request IDs.
   - Always combine with `tabular-nums` for alignment: `font-mono tabular-nums`.

---

## 4. Geometries & Component Elevation

| Component | Radius Token | CSS Class | Border & Shadow |
| :--- | :--- | :--- | :--- |
| **Content Cards** | 24px | `rounded-[24px]` | `border border-[#E4E4E0] bg-white shadow-2xs` |
| **Small Cards / Modals** | 20px / 24px | `rounded-[20px]` / `rounded-[24px]` | `border border-[#E4E4E0] shadow-lg` |
| **Form Inputs** | 16px | `rounded-2xl` | `border border-[#E4E4E0] focus:border-[#FF6B35]` |
| **Interactive Buttons** | Pill | `rounded-full` | `font-medium text-xs sm:text-sm px-5 py-2.5` |
| **Badges & Tags** | Pill | `rounded-full` | `text-[11px] font-semibold px-2.5 py-0.5` |
| **Progress Trackers** | Pill | `rounded-full` | `h-2 bg-[#F3F3F0] overflow-hidden` |

---

## 5. Motion Principles (Genjutsu `cast`)

- **Duration Tokens**:
  - `duration-fast`: `150ms` (buttons, icons, toggles, hover states)
  - `duration-medium`: `240ms` (dropdowns, popovers, tabs, mobile drawers)
  - `duration-slow`: `360ms` (modals, spotlight transitions, tour popups)
- **Easing Curve**:
  - Expressive Ease-Out: `cubic-bezier(0.16, 1, 0.3, 1)`
  - Standard Ease-In-Out: `cubic-bezier(0.4, 0, 0.2, 1)`
- **Reduced Motion**:
  - Always guarded by `motion-reduce:transition-none` and `@media (prefers-reduced-motion: reduce)`.
  - Content fades smoothly without spatial jumping.

---

## 6. Anti-Slop Constraints (Strict Invariants)

1. **NO Hardcoded Demo Credentials in Production UI**: Never display sample passwords or prefill forms with fake seed accounts.
2. **NO Decorative Floating Blobs**: No purple or blue neon glows floating in the background.
3. **NO Fake Metrics**: Skeletons must precede real data; zero-state must be genuine zero-state with a clear call-to-action.
4. **NO Mocked Gateway Operations**: Live gateway calls must hit actual endpoints and accurately report HTTP status codes and token costs.
5. **Always Tabular Numbers**: Every dollar sign and count MUST have `tabular-nums` applied.

