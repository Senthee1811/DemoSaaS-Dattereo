/**
 * 7.4 regression: finishing the product tour must never send a user whose workspace is
 * already set up back to /onboarding.
 */
import { afterEach, beforeEach, describe, expect, it, vi, beforeAll } from 'vitest';
import { preloadAllViews } from '@/components/dashboard/lazy-views';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { destinationAfterTour, hasCompletedOnboarding, ONBOARDING_COMPLETED, ONBOARDING_STATE_KEY } from '@/lib/onboarding';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
// Charts are irrelevant here and need a real layout engine
// next/dynamic runs for real (workspaces are lazy chunks). Only the chart library is stubbed: recharts needs real layout.
vi.mock('@/components/dashboard/OverviewCharts', () => ({ OverviewCharts: () => null }));

import DashboardPage from './page';

const project = {
  id: '3c66dcd5-9588-479c-ac9d-83c024ad1032',
  name: 'Support Bot',
  slug: 'support-bot',
  budgetMonthly: 100,
  budgetHardBlockEnabled: true,
  currentMonthlySpend: 0,
  isBlocked: false,
};

function mockApi(projects: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/v1/projects')
        ? { projects }
        : url.includes('/api/v1/keys')
          ? { providerKeys: [], gatewayKeys: [] }
          : url.includes('/api/v1/alerts')
            ? { alerts: [] }
            : url.includes('/api/v1/analytics')
              ? { summary: {}, dailySpend: [], modelBreakdown: [], projectBreakdown: [], recentRequests: [] }
              : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

async function runTourToTheEnd() {
  fireEvent.click(await screen.findByRole('button', { name: /Restart Product Tour/i }));
  await screen.findByRole('button', { name: /^Next$/ }); // the tour is a separate chunk, loaded on first use
  // Click Next until the last step's "Finish tour" button appears, then finish
  for (let i = 0; i < 20; i++) {
    const finish = screen.queryByRole('button', { name: /Finish tour/i });
    if (finish) {
      await act(async () => fireEvent.click(finish));
      return;
    }
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Next$/ })));
  }
  throw new Error('tour never reached its last step');
}

// The workspaces are separate chunks: compile them once up front (see preloadAllViews)
beforeAll(async () => {
  await preloadAllViews();
}, 60_000);

beforeEach(() => {
  localStorage.setItem('spendguard_token', 'test-token');
  localStorage.setItem('spendguard_user', JSON.stringify({ name: 'Alice', orgName: 'Acme', role: 'OWNER' }));
  push.mockClear();
  replace.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('7.4 tour completion never re-triggers onboarding', () => {
  it('org exists + onboarding completed → finish tour → stays on the console', async () => {
    localStorage.setItem(ONBOARDING_STATE_KEY, ONBOARDING_COMPLETED);
    mockApi([project]);
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getAllByText('Support Bot').length).toBeGreaterThan(0));

    await runTourToTheEnd();

    expect(push).not.toHaveBeenCalledWith('/onboarding');
    expect(replace).not.toHaveBeenCalledWith('/onboarding');
    // The tour must not downgrade the onboarding flag (it used to overwrite it with TOUR_COMPLETED)
    expect(localStorage.getItem(ONBOARDING_STATE_KEY)).toBe(ONBOARDING_COMPLETED);
    expect(localStorage.getItem('spendguard_tour_completed')).toBe('true');
  });

  it('org with a project but no flag on this browser (new device) → stays on the console', async () => {
    mockApi([project]);
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getAllByText('Support Bot').length).toBeGreaterThan(0));

    await runTourToTheEnd();

    expect(push).not.toHaveBeenCalledWith('/onboarding');
  });

  it('skipping the tour never navigates anywhere', async () => {
    mockApi([]);
    render(<DashboardPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Restart Product Tour/i }));
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: /^Skip tour$/ })[0]));
    expect(push).not.toHaveBeenCalledWith('/onboarding');
  });

  it('a brand-new org with nothing set up is still offered setup after finishing', async () => {
    mockApi([]);
    render(<DashboardPage />);
    await waitFor(() => expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0));
    await act(async () => {}); // let the empty project list land

    await runTourToTheEnd();

    expect(push).toHaveBeenCalledWith('/onboarding');
  });
});

describe('onboarding completion check', () => {
  it('flag or an existing project both mean set up', () => {
    expect(hasCompletedOnboarding({ onboardingState: ONBOARDING_COMPLETED, projectCount: 0 })).toBe(true);
    expect(hasCompletedOnboarding({ onboardingState: null, projectCount: 1 })).toBe(true);
    expect(hasCompletedOnboarding({ onboardingState: 'TOUR_COMPLETED', projectCount: 0 })).toBe(false);
  });

  it('stays on the console while projects are still loading', () => {
    expect(destinationAfterTour({ onboardingState: null, projectCount: 0, projectsLoaded: false })).toBe('console');
  });
});
