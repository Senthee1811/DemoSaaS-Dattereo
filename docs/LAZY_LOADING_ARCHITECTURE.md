# Lazy-loading architecture (frontend)

Goal: the dashboard shell and the Overview render from a small first bundle; everything the user has not asked for yet is a
separate chunk, fetched on demand (or on intent), with a placeholder that matches the real layout and a contained failure mode.
Every size below is from the production build in this repository; the before/after browser measurements are in
`docs/FRONTEND_PERFORMANCE_BASELINE.md`.

## 1. What loads when

| | Loads | Why |
|---|---|---|
| **Eager** (first bundle of `/dashboard`) | Application shell: Sidebar, Header (incl. the notification bell), scope/auth context, toasts, dialogs; the **Overview** workspace (KPI summary, activation checklist); `useApi`, `authFetch`, skeleton primitives; framer-motion (see §6) | The brief's critical path: navigation, authentication/organization context, critical dashboard summary. None of it may wait for a chunk |
| **Lazy workspaces** (`components/dashboard/lazy-views.tsx`) | Cost Insights (30 KB raw / 9 KB gz), Projects (17/5), Key Vault (27/7), Test Bench (16/5), Audit (26/8), Alerts (9/3), SDK (7/3), Team (8/3), Billing (14/4), Settings (63/17) | Each is only needed after the user chooses it. Settings is the largest (63 KB raw) |
| **Lazy overlays** | Welcome modal (6/2), Product tour (7/3), Help center (17/5) | Rendered only when opened. They mount on first use and then stay mounted so their exit animation still plays |
| **Lazy charts** | `OverviewCharts` (existing), `ForecastChart` (15/6) and the shared recharts chunk | The charting library is the single largest dependency. The forecast numbers render at once; only the plot waits |
| **Prefetch on intent** | Hover, keyboard focus or touch on a navigation item downloads that workspace's chunk (`prefetchTab`); hovering Help/Tour downloads those | So the click that follows usually finds the code already there. Prefetch downloads code only, never data |

Not lazy-loaded on purpose: the navigation, the authentication/organization shell, the Overview summary (the first thing every
session needs), small shared UI (badges, skeletons, empty states), and per-tab panels inside Cost Insights (each is 5–9 KB: splitting
them would cost more in requests than it saves in bytes).

## 2. The pieces

* `components/dashboard/lazy-views.tsx`: the single list of lazy workspaces/overlays. Loaders are module-level functions shared by
  `dynamic()` and `prefetchTab()`, so the browser fetches each chunk once whichever happens first. `view()` is generic, so every
  lazy workspace keeps its real prop types.
* `components/ui/LoadingSkeleton.tsx`: `ViewSkeleton` (whole workspace: heading, four cards, a table block, the same rhythm as the real
  views), `ChartAreaSkeleton` (a plot area reserved at the real chart's height), `DetailPanelSkeleton`, plus the existing
  `CardSkeleton`, `ChartSkeleton`, `TableRowSkeleton`. Pulse only; `prefers-reduced-motion` stops it globally (globals.css).
* `components/ui/LazyBoundary.tsx`: one error boundary per workspace (keyed by the selected tab, so moving on clears a failure; never
  nested around other lazy boundaries except the forecast chart's own). A failed **download** offers "Reload the page" (a rejected
  dynamic import stays rejected for the life of the page); any other error offers "Try again". `variant="overlay"` is a small fixed
  notice for modals and the tour. It logs only the error name and message, never component stacks or props.
* **Load failures are surfaced, not swallowed.** `next/dynamic` hands a failed download to its `loading` component instead of
  throwing, which would leave a skeleton spinning forever. The loading components rethrow `error` so the boundary catches it
  (found by a failing test, `app/dashboard/lazy-failure.test.tsx`).

## 3. Loading and error strategy

1. Click → the workspace's skeleton paints immediately (the shell never blocks) → the chunk arrives → the real view mounts and makes
   its own requests. A workspace makes **no** requests until it is opened.
2. A chunk that cannot be downloaded shows a contained message in that workspace only; the sidebar, header and the other workspaces keep
   working.
3. A chart that cannot be downloaded leaves the numbers on screen and replaces only the plot with the same message.
4. No `ssr: false`: no workspace needs a browser-only API at import time, and the dashboard only renders them on the client after the
   user's choice. No nested Suspense (only `dynamic()`'s own).
5. **Route-level `loading.tsx`** files exist for `/dashboard` and `/projects/[projectId]/usage` (client navigations into them, e.g. right
   after sign-in). They do not appear on a direct page load, because both routes' HTML is already complete.

## 4. Data loading rules (what changed and why)

* **Figures belong to a scope.** The Overview used to keep showing the previous project's numbers under the new Scope's name until the
  response arrived. Analytics are now stored together with the scope they were fetched for and shown only for the current scope (the
  skeleton appears in between). A slow response for an old scope can no longer overwrite a newer one (`lib/latest.ts`).
* **Polling pauses in hidden tabs** and catches up the moment the tab becomes visible again (it used to poll every 12 s regardless).
* **Cost Insights panels use an opt-in in-memory cache** (`useApi(url, { cacheMs: 60_000 })`, `lib/api-cache.ts`): returning to a tab
  within a minute shows its data immediately and makes no request; after a minute the saved copy is shown **labelled** ("Showing a saved
  copy from 14:02:11 while the latest loads…") while a fresh one loads; otherwise "Updated 14:03:05". `reload()` always goes to the
  network. Recommendations are decisions and are **never cached**. A decision invalidates every cached insights entry.
  * Safety: memory only (nothing in web storage); keys include the user and organization; cleared on sign-out/expired session;
    concurrent identical requests share one call; bounded to 60 entries.
* The selected Cost Insights tab is remembered for the browser session.
* Financial-state vocabulary on screen: *loading* (skeleton), *saved copy* (stale, labelled), *updated HH:MM:SS* (current), *estimated*
  and *over reserve* badges on ledger rows, and failed-call *exposure* shown as an upper bound, never as spend.

## 5. Adding a new lazy workspace or overlay

1. Add a loader and an export in `lazy-views.tsx` (`view(loader, 'Loading X')` for a workspace; `dynamic(loader, { loading: OverlayLoading })` for an overlay), and an entry in `LOADERS` if it is a tab.
2. Import it from `lazy-views`, never directly, in the dashboard.
3. Tests that render the dashboard should `await preloadAllViews()` once (compiling a module graph inside a 1 s `findBy` is slow under vitest), wait for `view-skeleton` to disappear, and stub only the chart module (`vi.mock('@/components/dashboard/OverviewCharts', …)`), **not** `next/dynamic`.

## 6. Considered and not done

* **framer-motion / motion-dom (about 134 KB raw, the largest remaining first-bundle item).** It is used app-wide (dialogs, page
  transitions, marketing reveals); `LazyMotion` could trim it but touches every animated component and the reduced-motion handling.
  Not changed here; listed as the next measured candidate.
* **Idle prefetch of likely next workspaces.** Intent-based prefetch is in; speculative prefetch spends the user's bandwidth on a guess
  and was not measured to be needed.
* **Splitting each Cost Insights panel.** 5–9 KB each: not worth a request.
* **Hourly rollups for investigation.** A database-side change, evaluated in `docs/FINANCIAL_INTELLIGENCE.md`; not justified by the plans.
