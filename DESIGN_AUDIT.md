# SpendGuard AI — Genjutsu Design Audit Report
**Brand**: Dattreo Studio ([www.dattreo.com](https://www.dattreo.com))  
**Auditor**: Principal Product Designer & Senior Staff UI Engineer  
**Date**: November 2026  
**Status**: Pre-Revamp Baseline Audit

---

## 1. Executive Summary

SpendGuard AI possesses a strong foundation in its dual editorial identity:
- **Public Marketing Website**: Anthropic-inspired warm parchment editorial (`#FAF8F5`, `#EFECE6`, `#141413`, Source Serif 4).
- **Authenticated FinOps Console**: Steep Editorial Analytics (clean white `#FFFFFF`, 24px cards, 16px inputs, pill buttons, tabular numbers, Dattreo orange `#FF6B35`).

However, the codebase exhibited several UX flaws, missing customer activation workflows, security hygiene issues, and structural gaps that must be corrected to achieve an enterprise-grade SaaS standard.

---

## 2. Component-by-Component Design Audit

### A. Authentication & Onboarding
| Component | Existing State | Flaws / Anti-Patterns Identified | Required Revamp |
| :--- | :--- | :--- | :--- |
| `app/login/page.tsx` | Functional login form | **CRITICAL**: Hardcoded "DEMO CREDENTIALS" box rendered (`sarah.chen@apexai.io` / `demo-password-123`). No eye-toggle to view password. "Forgot password?" is non-functional (`href="#"`). | Strip all demo credential UI from production. Add accessible eye-toggle (`Show password`/`Hide password`). Connect functional forgot-password flow. |
| `app/register/page.tsx` | 4-field registration form | Missing "Confirm Password" field. Missing password strength meter. No eye-toggle on password inputs. Minimal client-side validation. | Add Confirm Password with real-time matching. Add visual entropy/complexity strength indicator. Add eye toggles to both password fields. |
| `app/onboarding/page.tsx` | 4-step wizard | No post-signup welcome screen. No interactive product tour. The "Verify Connection" action in Step 4 is static rather than running a live gateway ping. | Implement post-signup Welcome Screen (Explore vs. Configure vs. Skip). Add 9-step Interactive Product Tour. Implement real gateway probe in Step 4. Add persistent dashboard checklist. |

### B. Navigation & Information Architecture
| Component | Existing State | Flaws / Anti-Patterns Identified | Required Revamp |
| :--- | :--- | :--- | :--- |
| `components/Sidebar.tsx` | Flat list of 9 tabs with small section labels | Unstructured flat hierarchy. Lacks dedicated Global/Help links. No mechanism to trigger/restart the product tour. | Group into 4 formal sections: **WORKSPACE** (Overview, Projects, Test Bench), **GOVERNANCE** (Key Vault, Alerts & Anomalies, Audit Ledger), **ORGANIZATION** (Team & Access, Billing), **GLOBAL** (Documentation, Help Center, Settings). Add "Restart Tour" trigger. |
| `components/Header.tsx` | Project selector + Test Bench shortcut | Missing help/documentation modal trigger. Breadcrumb context could be stronger. | Add Help Center popover / trigger, Tour restart button, and refined project scope switcher with keyboard accessibility. |

### C. Authenticated Workspaces (`OverviewView`, `ProjectsView`, etc.)
| Component | Existing State | Flaws / Anti-Patterns Identified | Required Revamp |
| :--- | :--- | :--- | :--- |
| `OverviewView.tsx` | 4 KPI cards + Recharts time series + donut chart | Charts are imported synchronously causing large bundle sizes. Lacks persistent onboarding checklist for new users. Date filters are fixed. | Implement dynamic lazy-loading for Recharts. Add persistent Onboarding Activation Checklist (collapsible when complete). Support 24h / 7d / 30d / MTD date filters. |
| `ProjectsView.tsx` | Project cards & modal | Modal inputs need accessible focus rings. Deletion / modification must strictly verify organization boundaries. | Refine modal ergonomics, add budget warning preview, enforce strict tenant scoping. |
| `KeyVaultView.tsx` | Provider keys & gateway tokens | Raw gateway tokens need 1-time copy protection. Provider keys must never expose plaintext. | Add clear 1-time token reveal modal with warning banner, clipboard feedback, and rotation guide. |
| `PlaygroundView.tsx` | Test bench prompt runner | Does not clearly distinguish estimated vs. actual tokens and costs before execution. | Display pre-flight estimated cost ceiling BEFORE submission, followed by settled actual tokens/cost. |
| `AuditView.tsx` | Table of requests | Loads in memory without server-side pagination; CSV export lacked auth header forwarding. | Implement server-side pagination query parameters and authenticated CSV export download. |
| `AlertsView.tsx` | Alert thresholds & logs | Needs interactive alert test trigger and Slack BlockKit preview. | Add "Send Test Alert" action, Slack webhook validator, and Z-score outlier severity tags. |
| `TeamView.tsx` | Member list | Role permissions (OWNER, ADMIN, MEMBER) need clear descriptions and backend enforcement. | Add explicit permission matrix table and invite expiration display. |
| `BillingView.tsx` | Stripe plans | Client-side state could get out of sync with Stripe webhooks. | Display verified subscription status, usage meter vs. tier quota, and Stripe Customer Portal link. |

---

## 3. Motion & Micro-Interaction Audit (Genjutsu Criteria)

- **Transitions**: Previously used instantaneous jumps or generic Tailwind defaults. Must standardize on `cubic-bezier(0.16, 1, 0.3, 1)` (expressive ease-out) for panels, 150ms for buttons, 240ms for modals and drawers.
- **Copy Feedback**: Clipboard actions on tokens must show an inline animated "Copied to clipboard!" tooltip for 2 seconds.
- **Budget Indicators**: Progress bars must animate smoothly with CSS transitions when usage changes.
- **Reduced Motion**: Add full `@media (prefers-reduced-motion: reduce)` support disabling non-essential transforms and easing transitions to instant opacities.

---

## 4. Verification & Defense Gates

1. **Zero Exposure of Test Credentials**: Verify `app/login/page.tsx` and all bundles contain zero prefilled emails or demo passwords.
2. **Form Accessibility**: All inputs have associated `<label>` elements or `aria-label`, visible 2px `#FF6B35` focus rings, and `aria-invalid` bindings.
3. **Data Integrity**: Tabular numerals (`tabular-nums`) applied to every single currency, token, and percentage figure.
4. **Fail-Closed Preservation**: Zero regressions in Redis Lua budget reservation state machine.

