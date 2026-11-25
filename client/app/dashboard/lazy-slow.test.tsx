/**
 * A workspace whose code is SLOW to download: the click does not blank the screen. The previous workspace stays, the navigation
 * item reports it is busy, and only if the wait exceeds NAVIGATE_WAIT_MS does the skeleton take over, until the real view arrives.
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
// The Audit chunk takes 700 ms to arrive
vi.mock('@/components/audit/AuditView', async (importOriginal) => {
  await new Promise((r) => setTimeout(r, 700));
  return await importOriginal<typeof import('@/components/audit/AuditView')>();
});

import DashboardPage from './page';

beforeEach(() => {
  localStorage.setItem('spendguard_token', 't');
  localStorage.setItem('spendguard_user', JSON.stringify({ name: 'Alice', orgName: 'Acme', role: 'OWNER' }));
  localStorage.setItem('spendguard_tour_completed', 'true');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/v1/projects') ? { projects: [] } : url.includes('/api/v1/keys') ? { providerKeys: [], gatewayKeys: [] } : url.includes('/api/v1/alerts') ? { alerts: [] } : url.includes('/api/v1/audit') ? { logs: [], total: 0 } : url.includes('/unread-count') ? { unread: 0 } : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('a slow workspace chunk', () => {
  it('keeps the current screen and marks the item busy, then shows the skeleton, then the real view', async () => {
    render(
      <Providers>
        <DashboardPage />
      </Providers>,
    );
    const nav = within(await screen.findByRole('navigation'));
    await screen.findByRole('main');
    const item = nav.getByRole('button', { name: /Audit Ledger/ });
    fireEvent.click(item);
    // immediately: nothing is blanked, the item says it is working
    expect(item).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('view-skeleton')).toBeNull();
    expect(screen.queryByText('Audit Trail & Ledger')).toBeNull();
    // after the bounded wait the dashboard switches and the skeleton gives feedback while the chunk is still coming
    expect(await screen.findByTestId('view-skeleton', undefined, { timeout: 3_000 })).toBeInTheDocument();
    expect(item).not.toHaveAttribute('aria-busy');
    // and finally the real workspace
    expect(await screen.findByText('Audit Trail & Ledger', undefined, { timeout: 15_000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('view-skeleton')).toBeNull());
  }, 30_000);

  it('the latest click wins: clicking another workspace while one is still loading ends on the second', async () => {
    render(
      <Providers>
        <DashboardPage />
      </Providers>,
    );
    const nav = within(await screen.findByRole('navigation'));
    await screen.findByRole('main');
    fireEvent.click(nav.getByRole('button', { name: /Audit Ledger/ }));
    await act(async () => fireEvent.click(nav.getByRole('button', { name: /Gateway SDK & Docs/ })));
    await act(async () => new Promise((r) => setTimeout(r, 1_200))); // long enough for the Audit chunk to have arrived too
    expect(screen.queryByText('Audit Trail & Ledger')).toBeNull();
    expect(screen.getAllByText(/SDK/i).length).toBeGreaterThan(0);
  }, 30_000);
});
