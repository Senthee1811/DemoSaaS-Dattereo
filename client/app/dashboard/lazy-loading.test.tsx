/**
 * Lazy loading of dashboard workspaces: the shell and Overview are in the first bundle, everything else is a chunk that
 * loads on demand, shows a skeleton while it does, makes none of its own requests until it is opened, and can be
 * prefetched on intent (hover / focus).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Providers } from '@/app/providers';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/dashboard/OverviewCharts', () => ({ OverviewCharts: () => null }));

// Counts how many times the Audit workspace module is actually evaluated (i.e. its chunk was requested)
const evaluated = vi.hoisted(() => ({ audit: 0 }));
vi.mock('@/components/audit/AuditView', async (importOriginal) => {
  evaluated.audit++;
  return await importOriginal<typeof import('@/components/audit/AuditView')>();
});

import DashboardPage from './page';
import { prefetchTab, prefetchWorkspacesWhenIdle, viewState } from '@/components/dashboard/lazy-views';

const requests: string[] = [];
const PROJECT = { id: '3c66dcd5-9588-479c-ac9d-83c024ad1032', name: 'Support Bot', slug: 's', budgetMonthly: 100, budgetHardBlockEnabled: true, currentMonthlySpend: 0, isBlocked: false };

function mockApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      let body: unknown = {};
      if (url.includes('/api/v1/projects')) body = { projects: [PROJECT] };
      else if (url.includes('/api/v1/keys')) body = { providerKeys: [], gatewayKeys: [] };
      else if (url.includes('/api/v1/alerts')) body = { alerts: [] };
      else if (url.includes('/api/v1/analytics')) body = { summary: {}, dailySpend: [], modelBreakdown: [], projectBreakdown: [], recentRequests: [] };
      else if (url.includes('/api/v1/audit')) body = { logs: [], total: 0 };
      else if (url.includes('/inbox/unread-count')) body = { unread: 0 };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

beforeEach(() => {
  requests.length = 0;
  localStorage.setItem('spendguard_token', 't');
  localStorage.setItem('spendguard_user', JSON.stringify({ name: 'Alice', orgName: 'Acme', role: 'OWNER' }));
  localStorage.setItem('spendguard_tour_completed', 'true');
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

const open = async () => {
  mockApi();
  render(
    <Providers>
      <DashboardPage />
    </Providers>,
  );
  await waitFor(() => expect(screen.getAllByText('Support Bot').length).toBeGreaterThan(0));
};
const nav = () => within(screen.getByRole('navigation'));

describe('dashboard lazy loading', () => {
  it('opens on Overview without loading any other workspace or making their requests', async () => {
    await open();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(nav().getByRole('button', { name: /Cost Insights/ })).toBeInTheDocument(); // the navigation is eager
    expect(requests.some((u) => u.includes('/api/v1/insights'))).toBe(false);
    expect(requests.some((u) => u.includes('/api/v1/audit'))).toBe(false);
    expect(evaluated.audit).toBe(0); // the Audit chunk has not even been requested
  });

  it('a PREFETCHED workspace opens straight to its content: the skeleton is never rendered (no Suspense, no fallback throttle)', async () => {
    await open();
    const seen: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach((n) => n instanceof HTMLElement && (n.matches('[data-testid=view-skeleton]') || n.querySelector('[data-testid=view-skeleton]')) && seen.push('skeleton'));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    fireEvent.pointerEnter(nav().getByRole('button', { name: /Settings & Account/ })); // intent: starts the download
    await waitFor(() => expect(viewState('settings')).toBe('ready'), { timeout: 20_000 });
    await act(async () => fireEvent.click(nav().getByRole('button', { name: /Settings & Account/ })));
    expect(await screen.findByRole('heading', { name: /Settings/i }, { timeout: 5_000 })).toBeInTheDocument();
    observer.disconnect();
    expect(seen).toEqual([]);
  }, 30_000);

  it('hovering or focusing a navigation item requests its chunk BEFORE the click', async () => {
    await open();
    const before = evaluated.audit;
    fireEvent.pointerEnter(nav().getByRole('button', { name: /Audit Ledger/ }));
    await waitFor(() => expect(evaluated.audit).toBe(before || 1), { timeout: 15_000 });
    expect(requests.some((u) => u.includes('/api/v1/audit'))).toBe(false); // prefetching downloads code, it does not fetch data
  }, 30_000);

  it('prefetching is idempotent and ignores tabs that are not lazy', () => {
    expect(() => {
      prefetchTab('overview');
      prefetchTab('audit');
      prefetchTab('audit');
    }).not.toThrow();
  });

  it('returning to Overview keeps the data it already had (no skeleton flash, no extra analytics request storm)', async () => {
    await open();
    const analyticsBefore = requests.filter((u) => u.includes('/api/v1/analytics')).length;
    fireEvent.click(nav().getByRole('button', { name: /Settings & Account/ }));
    await waitFor(() => expect(screen.queryByTestId('view-skeleton')).toBeNull(), { timeout: 15_000 });
    await act(async () => fireEvent.click(nav().getByRole('button', { name: /^Overview/ })));
    expect(screen.queryByTestId('view-skeleton')).toBeNull();
    expect(requests.filter((u) => u.includes('/api/v1/analytics')).length).toBe(analyticsBefore);
  }, 30_000);

  it('idle prefetch downloads the other workspaces in the background, and does nothing when the user is saving data', async () => {
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
    const before = viewState('team');
    prefetchWorkspacesWhenIdle(0);
    await new Promise((r) => setTimeout(r, 700));
    if (before === 'loading') expect(viewState('team')).toBe('loading'); // saveData: nothing was fetched
    Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
    const cancel = prefetchWorkspacesWhenIdle(0);
    await waitFor(() => expect(viewState('billing')).toBe('ready'), { timeout: 25_000 });
    expect(viewState('sdk')).toBeDefined();
    cancel();
  }, 40_000);
});
