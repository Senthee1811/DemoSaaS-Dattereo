/**
 * When one workspace's code cannot be downloaded the dashboard shell must survive: navigation and the other workspaces keep
 * working, the failed section says what happened and offers the right recovery.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Providers } from '@/app/providers';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/dashboard/OverviewCharts', () => ({ OverviewCharts: () => null }));
// The Team workspace's chunk fails to download
vi.mock('@/components/team/TeamView', () => {
  throw Object.assign(new Error('Loading chunk 77 failed.'), { name: 'ChunkLoadError' });
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
      const body = url.includes('/api/v1/projects') ? { projects: [] } : url.includes('/api/v1/keys') ? { providerKeys: [], gatewayKeys: [] } : url.includes('/api/v1/alerts') ? { alerts: [] } : url.includes('/inbox/unread-count') ? { unread: 0 } : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('a workspace chunk that fails to download', () => {
  it('shows a contained message, keeps the shell and other workspaces working, and clears when you move on', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <Providers>
        <DashboardPage />
      </Providers>,
    );
    const nav = () => within(screen.getByRole('navigation'));
    await screen.findByRole('main');
    fireEvent.click(nav().getByRole('button', { name: /Team & Access/ }));
    const alert = await screen.findByTestId('lazy-error', undefined, { timeout: 15_000 });
    expect(alert).toHaveTextContent('Team could not be loaded');
    // a recovery action is offered (vitest wraps a failing module factory, so the exact download-vs-render wording is covered in LazyBoundary.test)
    expect(screen.getByRole('button', { name: /Try again|Reload the page/ })).toBeInTheDocument();
    // the shell is intact and the rest of the dashboard still works
    expect(nav().getByRole('button', { name: /Overview/ })).toBeInTheDocument();
    fireEvent.click(nav().getByRole('button', { name: /Gateway SDK & Docs/ }));
    await waitFor(() => expect(screen.queryByTestId('lazy-error')).toBeNull(), { timeout: 15_000 });
    await waitFor(() => expect(screen.queryByTestId('view-skeleton')).toBeNull(), { timeout: 15_000 });
  }, 40_000);
});
