# SpendGuard AI — Design System & Implementation Guide (Dattreo Studio)
## Dual Editorial Architecture: Steep Analytics (Dashboard) & Anthropic Editorial (Marketing)
*Persistent Master Reference: See `MASTER.md` for complete token dictionary and Genjutsu theses.*

---

## 1. Core Visual Foundations

SpendGuard AI is built around a unified Dattreo brand identity split into two purposeful, high-craft editorial directions:

1. **Authenticated App (Dashboard & Console)**: **Steep Editorial Analytics**  
   Pure white and light neutral canvas, refined serif display titles, minimalist sans-serif interface elements, 24px content card radii (`rounded-[24px]`), 16px input radii (`rounded-2xl`), pill-shaped buttons (`rounded-full`), and generous whitespace.
2. **Public Website (Marketing & Showcase)**: **Anthropic-Inspired Editorial Design**  
   Warm parchment ivory canvas (`#FAF8F5`), oat-toned surfaces (`#EFECE6`), large serif display typography (48–68px), hairline dividers (`#E5E0D8`), selective corner radii on buttons, and a dark inversion footer (`#141413`).

---

## 2. Shared Dattreo Brand Palette

| Token | Value | Semantic Role |
| :--- | :--- | :--- |
| `--color-dattreo-orange` | `#FF6B35` | Primary brand accent, primary CTA fills, active tab highlights |
| `--color-dattreo-orange-hover` | `#E55A25` | Hover state for primary buttons |
| `--color-dattreo-orange-subtle` | `#FFF7F2` | Subtle tint for active items, highlight cards, badges |
| `--color-dattreo-orange-border` | `#FFD2C0` | Hairline border for orange-tinted active items |
| `--color-text-primary` | `#18191B` | High-contrast body, table rows, and sans-serif titles |
| `--color-text-secondary` | `#5F6368` | Subheadings, descriptions, secondary table data |
| `--color-text-muted` | `#80868B` | Table headers, timestamps, meta badges |
| `--color-border-hairline` | `#E4E4E0` | Dashboard hairline dividers and card borders |
| `--color-border-parchment` | `#E5E0D8` | Marketing website hairline dividers |
| `--color-parchment-ivory` | `#FAF8F5` | Public website background canvas |
| `--color-parchment-oat` | `#EFECE6` | Public website secondary surfaces |
| `--color-inversion-dark` | `#141413` | Footer, terminal code containers, dark badges |

### Multi-Provider Chart Palette
- **OpenAI (GPT-4o / o1)**: `#FF6B35` (Dattreo Brand Orange)
- **Anthropic (Claude 3.5 Sonnet)**: `#2563EB` (Cobalt Blue)
- **Google (Gemini 1.5 Pro)**: `#0D9488` (Teal)
- **Other Models / Aggregates**: `#7C3AED` (Purple)

---

## 3. Direction A: Steep Editorial Analytics (Dashboard)

### Geometry & Surfaces
- **Main Canvas**: `#FFFFFF` or `#FAFAF9`
- **Secondary Surfaces**: `#F4F4F3` / `#F7F7F6`
- **Featured Surfaces**: `#FFF7F2` (Warm orange tint with `#FFD2C0` border)
- **Content Card Radius**: `24px` (`rounded-[24px]`)
- **Small Card / Input Radius**: `16px` (`rounded-2xl`)
- **Button Radius**: **Pill-shaped (`rounded-full`)**
- **Border**: 1px solid `#E4E4E0` (hairline)
- **Elevation**: Minimal/restrained `shadow-[0_1px_3px_rgba(0,0,0,0.04)]`

### Typography Hierarchy
- **Section & View Titles**: Refined Serif (`font-serif`, Source Serif 4 / Georgia), e.g. `text-2xl sm:text-3xl font-normal text-[#18191B] tracking-tight`.
- **Metrics & Currency**: Large Serif Display or Bold Sans with `tabular-nums` (`font-serif text-3xl font-medium tracking-tight tabular-nums`).
- **Navigation & Labels**: Sans-Serif (`Inter`), `text-xs sm:text-sm font-medium`.
- **Table Data**: Sans-Serif with `tabular-nums` for currency, tokens, and latencies.
- **Technical Tokens**: Monospace (`font-mono text-xs`), e.g. `sg_live_*`, `req_*`, `aes_256_gcm`.

---

## 4. Direction B: Anthropic Editorial Design (Public Website)

### Geometry & Surfaces
- **Canvas**: Warm Ivory `#FAF8F5`
- **Content Cards**: Brighter Ivory `#FFFFFF` with `#E5E0D8` hairline border
- **Secondary Surfaces**: Oat `#EFECE6` and Manilla `#F5EFEB`
- **Inversion Surfaces**: Near-black `#141413` with `#2A2A28` hairline borders
- **Button Geometry**: Pill-shaped (`rounded-full`) with subtle asymmetric corner or crisp border
- **Divider**: 1px solid `#E5E0D8`

### Typography Hierarchy
- **Display Hero**: Refined Serif, 56–68px, `font-serif tracking-tight leading-[1.08]`
- **Section Headlines**: Refined Serif, 36–48px, `font-serif tracking-tight`
- **Subheadings**: 20–24px, `font-serif text-[#444440] leading-snug`
- **Body Text**: 17–19px sans-serif, `leading-relaxed text-[#555550]`
- **Technical Badges**: 11–12px monospace, `#555550`

---

## 5. Anti-AI-Slop Governance

1. **No Neon / Glow Effects**: Zero blurred colorful blobs (`blur-3xl`, neon radial gradients).
2. **No Generic Purple-to-Blue Gradients**: Color usage is restricted to intentional Dattreo Orange (`#FF6B35`) and verified chart series colors.
3. **No Proportional Number Jitter**: Every currency, token count, percentage, and latency must use `tabular-nums`.
4. **No Continuous Bouncing Animations**: Subtle, stateful hover and focus transitions only (150ms duration).
5. **No Faux Marketing Hyperbole**: Factual, engineering-focused descriptions that explain concrete system behavior.

---

## 6. Responsive Breakpoint Standards

- **Mobile (< 768px)**: Single column layouts, horizontal scrolling for data tables with touch-friendly swipe, full-width pill buttons, collapsable navigation drawer.
- **Tablet (768px – 1024px)**: 2-column metric summaries, adaptive sidebar with collapsed mode, table view with priority column hiding.
- **Desktop (1024px – 1440px)**: 1200px max content container, split-pane developer test bench, comprehensive data tables with sticky headers.
- **Wide Desktop (> 1440px)**: Centered layout with generous whitespace padding.
