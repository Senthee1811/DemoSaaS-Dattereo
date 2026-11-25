/**
 * Financial figures must never be shown under the wrong scope, and a slow response for an old scope must never overwrite a
 * newer one. Both used to be possible on the dashboard Overview.
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

import DashboardPage from './page';

const A = { id: '3c66dcd5-9588-479c-ac9d-83c024ad1032', name: 'Alpha' };
const B = { id: '4d77ede6-a699-48ad-bd34-94d135be2143', name: 'Beta' };
const project = (p: { id: string; name: string }) => ({ ...p, slug: p.name, budgetMonthly: 100, budgetHardBlockEnabled: true, currentMonthlySpend: 0, isBlocked: false });
const summary = (spend: number) => ({ summary: { totalSpend: spend, totalBudget: 1000, totalRequests: 1, totalTokens: 1, avgLatencyMs: 1, anomalyCount: 0, blockedCount: 0 }, dailySpend: [], modelBreakdown: [], projectBreakdown: [], recentRequests: [] });

let analyticsCalls: Array<{ scope: string; release: () => void; settled: Promise<void> }> = [];

beforeEach(() => {
  analyticsCalls = [];
  localStorage.setItem('spendguard_token', 't');
  localStorage.setItem('spendguard_user', JSON.stringify({ name: 'Al', orgName: 'Acme', role: 'OWNER' }));
  localStorage.setItem('spendguard_tour_completed', 'true');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/api/v1/projects')) return json({ projects: [project(A), project(B)] });
      if (url.includes('/api/v1/keys')) return json({ providerKeys: [], gatewayKeys: [] });
      if (url.includes('/api/v1/alerts')) return json({ alerts: [] });
      if (url.includes('/unread-count')) return json({ unread: 0 });
      if (url.includes('/api/v1/analytics')) {
        // every analytics response is held until the test releases it, so the test controls the ORDER they arrive in
        const scope = new URL(url, 'http://x').searchParams.get('projectId') ?? '';
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        let done!: () => void;
        const settled = new Promise<void>((r) => (done = r));
        analyticsCalls.push({ scope, release, settled });
        await gate;
        done();
        return json(summary(scope === A.id ? 111 : scope === B.id ? 222 : 999));
      }
      return json({});
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

const select = async () => (await screen.findByLabelText('Scope Project Selection')) as HTMLSelectElement;
const optionValue = (s: HTMLSelectElement, name: string) => (within(s).getByRole('option', { name }) as HTMLOptionElement).value;
const releaseAll = async () => {
  for (const c of analyticsCalls) c.release();
  await act(async () => {
    await Promise.all(analyticsCalls.map((c) => c.settled));
  });
};

describe('dashboard figures belong to the scope they were fetched for', () => {
  it('after switching Scope the old scope\'s figures are NOT shown while the new ones load', async () => {
    render(<Providers><DashboardPage /></Providers>);
    const s = await select();
    await waitFor(() => expect(within(s).getAllByRole('option').length).toBe(3));
    await releaseAll();
    await waitFor(() => expect(screen.getAllByText(/999\.00/).length).toBeGreaterThan(0)); // All projects
    analyticsCalls = [];
    await act(async () => fireEvent.change(s, { target: { value: optionValue(s, 'Alpha') } }));
    // Alpha's request is in flight and held: nothing from "All projects" may be on screen under Alpha's name
    await waitFor(() => expect(analyticsCalls.some((c) => c.scope === A.id)).toBe(true));
    expect(screen.queryByText(/999\.00/)).toBeNull();
    await releaseAll();
    await waitFor(() => expect(screen.getAllByText(/111\.00/).length).toBeGreaterThan(0));
  });

  it('a slow response for an OLD scope arriving last cannot overwrite the current scope\'s figures', async () => {
    render(<Providers><DashboardPage /></Providers>);
    const s = await select();
    await waitFor(() => expect(within(s).getAllByRole('option').length).toBe(3));
    await releaseAll();
    analyticsCalls = [];
    await act(async () => fireEvent.change(s, { target: { value: optionValue(s, 'Alpha') } }));
    await waitFor(() => expect(analyticsCalls.some((c) => c.scope === A.id)).toBe(true));
    await act(async () => fireEvent.change(s, { target: { value: optionValue(s, 'Beta') } }));
    await waitFor(() => expect(analyticsCalls.some((c) => c.scope === B.id)).toBe(true));
    // Beta (the current scope) answers first, then the slow Alpha answer arrives LAST
    const beta = analyticsCalls.find((c) => c.scope === B.id)!;
    const alpha = analyticsCalls.find((c) => c.scope === A.id)!;
    beta.release();
    await act(async () => beta.settled);
    await waitFor(() => expect(screen.getAllByText(/222\.00/).length).toBeGreaterThan(0));
    alpha.release();
    await act(async () => alpha.settled);
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(screen.getAllByText(/222\.00/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/111\.00/)).toBeNull();
  });
});
