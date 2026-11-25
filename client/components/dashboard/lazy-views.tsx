'use client';

/**
 * Code-splitting for the dashboard: ONE place that says which workspaces and overlays load on demand.
 *
 * Eager (in the initial bundle, on purpose): the app shell and navigation (Sidebar, Header), the data/scope providers, and
 * the default workspace, Overview (the "critical dashboard summary"). Everything the user has not asked for yet is a separate
 * chunk loaded when it is opened.
 *
 * THE SUSPENSE TRAP THIS FILE AVOIDS. A lazy component that suspends makes React commit a fallback, and React then refuses to
 * reveal the real content until ~300 ms after that fallback (its "fallback throttle"), even when the chunk arrived in 5 ms.
 * Measured here: every first visit to a workspace cost a constant ~340 ms on a fast connection. So:
 *   1. a workspace remembers when its module has resolved (`ensure()`), and once it has, renders it DIRECTLY: no Suspense, no
 *      fallback, no throttle;
 *   2. the dashboard waits for the chunk (at most NAVIGATE_WAIT_MS) BEFORE switching tab, so on a normal connection the first
 *      click already finds the code, and on a slow one the skeleton path below takes over and the user sees it immediately;
 *   3. hover / focus / touch on a navigation item calls `prefetchTab`, which is the same `ensure()`.
 * The `dynamic()` wrapper remains as the slow-path/failure path: it shows the skeleton and surfaces a failed download.
 *
 * Rules (see docs/LAZY_LOADING_ARCHITECTURE.md): no ssr:false (none of these needs a browser-only API and the dashboard only
 * renders them on the client after the user's choice); a failed download is rethrown to <LazyBoundary>.
 */
import { useState, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { ViewSkeleton } from '@/components/ui/LoadingSkeleton';
import type { NavTab } from '@/components/Sidebar';

/**
 * next/dynamic hands a failed download to its `loading` component (as `error`) instead of throwing. Showing the skeleton for
 * that would spin forever, so the failure is rethrown here and caught by the dashboard's <LazyBoundary>.
 */
type LoadingProps = { error?: Error | null } | undefined;
const skeletonFor = (label: string) =>
  function ViewLoading(props: LoadingProps) {
    if (props?.error) throw props.error;
    return <ViewSkeleton label={label} />;
  };
function OverlayLoading(props: LoadingProps) {
  if (props?.error) throw props.error;
  return null;
}

/** How long a click waits for the chunk before the skeleton path takes over. Long enough for a normal connection, short enough to feel instant. */
export const NAVIGATE_WAIT_MS = 120;

interface ViewHandle {
  /** Starts (or joins) the download. Resolves when the module is available; rejects if the download failed. */
  ensure: () => Promise<unknown>;
  isResolved: () => boolean;
}
const handles = new Map<NavTab, ViewHandle>();

/** Generic so each lazy workspace keeps its real prop types. */
function makeView<P extends object>(tab: NavTab, loader: () => Promise<ComponentType<P>>, label: string) {
  let resolved: ComponentType<P> | null = null;
  let inflight: Promise<ComponentType<P>> | null = null;
  const ensure = () => {
    if (resolved) return Promise.resolve(resolved);
    inflight ??= loader().then(
      (c) => (resolved = c),
      (err) => {
        inflight = null; // a later attempt may succeed
        throw err;
      },
    );
    return inflight;
  };
  handles.set(tab, { ensure, isResolved: () => resolved !== null });
  const Slow = dynamic(loader, { loading: skeletonFor(label) });
  return function LazyView(props: P) {
    // Decided ONCE per mount: switching component type later would remount the workspace and lose its state
    const [Direct] = useState<ComponentType<P> | null>(() => resolved);
    return Direct ? <Direct {...props} /> : <Slow {...props} />;
  };
}

export const InsightsView = makeView('insights', () => import('@/components/insights/InsightsView').then((m) => m.InsightsView), 'Loading Cost Insights');
export const ProjectsView = makeView('projects', () => import('@/components/projects/ProjectsView').then((m) => m.ProjectsView), 'Loading projects');
export const KeyVaultView = makeView('keys', () => import('@/components/keys/KeyVaultView').then((m) => m.KeyVaultView), 'Loading the key vault');
export const PlaygroundView = makeView('playground', () => import('@/components/playground/PlaygroundView').then((m) => m.PlaygroundView), 'Loading the test bench');
export const AuditView = makeView('audit', () => import('@/components/audit/AuditView').then((m) => m.AuditView), 'Loading the audit ledger');
export const AlertsView = makeView('alerts', () => import('@/components/alerts/AlertsView').then((m) => m.AlertsView), 'Loading alerts');
export const SdkView = makeView('sdk', () => import('@/components/sdk/SdkView').then((m) => m.SdkView), 'Loading the SDK guide');
export const TeamView = makeView('team', () => import('@/components/team/TeamView').then((m) => m.TeamView), 'Loading team');
export const BillingView = makeView('billing', () => import('@/components/billing/BillingView').then((m) => m.BillingView), 'Loading billing');
export const SettingsView = makeView('settings', () => import('@/components/settings/SettingsView').then((m) => m.SettingsView), 'Loading settings');

const loadWelcome = () => import('@/components/onboarding/WelcomeModal').then((m) => m.WelcomeModal);
const loadTour = () => import('@/components/tour/ProductTour').then((m) => m.ProductTour);
const loadHelp = () => import('@/components/help/HelpCenterModal').then((m) => m.HelpCenterModal);

// Overlays render nothing until opened; a spinner for a few milliseconds would be noise
export const WelcomeModal = dynamic(loadWelcome, { loading: OverlayLoading });
export const ProductTour = dynamic(loadTour, { loading: OverlayLoading });
export const HelpCenterModal = dynamic(loadHelp, { loading: OverlayLoading });

/** 'ready' = its code is already loaded (or it is not lazy), so switching to it will not suspend. */
export function viewState(tab: NavTab): 'ready' | 'loading' {
  const h = handles.get(tab);
  return !h || h.isResolved() ? 'ready' : 'loading';
}

/**
 * Resolves when the workspace's code is available, or after `waitMs`, whichever comes first. NEVER rejects: if the download
 * failed, the dashboard switches anyway and the workspace's own failure UI (LazyBoundary) reports it and offers a retry.
 */
export function readyOrTimeout(tab: NavTab, waitMs = NAVIGATE_WAIT_MS): Promise<'ready' | 'slow'> {
  const h = handles.get(tab);
  if (!h || h.isResolved()) return Promise.resolve('ready');
  return Promise.race([
    h.ensure().then(
      () => 'ready' as const,
      () => 'slow' as const,
    ),
    new Promise<'slow'>((r) => setTimeout(() => r('slow'), waitMs)),
  ]);
}

/**
 * Starts downloading a workspace's code (hover, keyboard focus or touch on its navigation item) so the click that follows finds it
 * already loaded. Safe to call repeatedly; failures are ignored here (the real load reports them).
 */
export function prefetchTab(tab: NavTab) {
  handles.get(tab)?.ensure().catch(() => undefined);
}

/** Most-used first. Overlays are not included: they open on an explicit action and prefetch on hover. */
const IDLE_PREFETCH_ORDER: NavTab[] = ['insights', 'audit', 'projects', 'playground', 'keys', 'settings', 'alerts', 'team', 'billing', 'sdk'];

/**
 * After the first screen is complete, downloads the other workspaces ONE AT A TIME while the browser is idle, so a first click on any
 * of them finds its code already loaded (without this, each first visit pays a download: measured +100-450 ms on Slow-4G).
 * Starts `startAfterMs` after the first screen is complete: started immediately, these downloads competed with the Overview chart's own
 * chunk and made the initial load slower (measured on Slow-4G). Does nothing when the user asked to save data or is on a 2G-class
 * connection. Returns a cancel function.
 */
export function prefetchWorkspacesWhenIdle(startAfterMs = 2_500): () => void {
  const conn = (typeof navigator !== 'undefined' ? (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection : undefined);
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '')) return () => undefined;
  let cancelled = false;
  const idle = (fn: () => void) =>
    typeof requestIdleCallback === 'function' ? requestIdleCallback(() => fn(), { timeout: 3_000 }) : window.setTimeout(fn, 300);
  const step = (i: number) => {
    if (cancelled || i >= IDLE_PREFETCH_ORDER.length) return;
    const h = handles.get(IDLE_PREFETCH_ORDER[i]);
    if (!h || h.isResolved()) return step(i + 1);
    idle(() => {
      if (cancelled) return;
      h.ensure().then(() => step(i + 1), () => step(i + 1)); // a failure is reported when the user opens it, not here
    });
  };
  const timer = window.setTimeout(() => step(0), startAfterMs);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}

export function prefetchOverlay(which: 'help' | 'tour') {
  (which === 'help' ? loadHelp : loadTour)().catch(() => undefined);
}

/**
 * Downloads every workspace chunk. Dashboard integration tests call it once per file so the first navigation does not pay the
 * compile cost of a module graph inside a 1-second assertion timeout; it is not used by the product.
 */
export async function preloadAllViews() {
  await Promise.all([...[...handles.values()].map((h) => h.ensure()), loadWelcome(), loadTour(), loadHelp()]);
}
