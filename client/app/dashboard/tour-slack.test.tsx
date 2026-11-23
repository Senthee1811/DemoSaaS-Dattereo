/** 7.10: the tour shows Settings → Notifications and sends a REAL test alert (POST /api/v1/alerts). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Providers } from '@/app/providers';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

import DashboardPage from './page';

const PROJECT = { id: '3c66dcd5-9588-479c-ac9d-83c024ad1032', name: 'Support Bot', slug: 's', budgetMonthly: 100, budgetHardBlockEnabled: true, currentMonthlySpend: 0, isBlocked: false };
const requests: Array<{ url: string; method: string; body: unknown }> = [];

function mockApi(alertStatus: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || 'GET';
      requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      let body: unknown = {};
      if (url.includes('/api/v1/alerts/config')) body = { slackUrlSaved: false, slackConfigured: false, lastSlackStatus: null, lastSlackError: null };
      else if (url.includes('/api/v1/alerts') && method === 'POST') body = { alert: { id: 'a1', status: alertStatus } };
      else if (url.includes('/api/v1/alerts')) body = { alerts: [] };
      else if (url.includes('/api/v1/projects')) body = { projects: [PROJECT] };
      else if (url.includes('/api/v1/keys')) body = { providerKeys: [], gatewayKeys: [] };
      else if (url.includes('/api/v1/analytics')) body = { summary: {}, dailySpend: [], modelBreakdown: [], projectBreakdown: [], recentRequests: [] };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

async function openSlackStep() {
  render(
    <Providers>
      <DashboardPage />
    </Providers>,
  );
  await waitFor(() => expect(screen.getAllByText('Support Bot').length).toBeGreaterThan(0));
  fireEvent.click(screen.getByRole('button', { name: /Restart Product Tour/i }));
  for (let i = 0; i < 12 && !screen.queryByText('7. Slack Alerts'); i++) {
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Next$/ })));
  }
  expect(screen.getByText('7. Slack Alerts')).toBeInTheDocument();
}

beforeEach(() => {
  requests.length = 0;
  localStorage.setItem('spendguard_token', 't');
  localStorage.setItem('spendguard_user', JSON.stringify({ name: 'Alice', orgName: 'Acme', role: 'OWNER' }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('7.10 tour: Slack + alerts step', () => {
  it('opens Settings → Notifications with the Slack webhook field and its Send test alert button', async () => {
    mockApi('IN_APP');
    await openSlackStep();
    expect(await screen.findByLabelText('Slack Incoming Webhook URL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Send test alert$/ })).toBeInTheDocument();
  });

  it('sends a real POST /api/v1/alerts and reports the real outcome (no webhook → in-app only)', async () => {
    mockApi('IN_APP');
    await openSlackStep();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Send a real test alert/ })));

    const post = requests.find((r) => r.method === 'POST' && r.url.endsWith('/api/v1/alerts'));
    expect(post?.body).toEqual({ projectId: PROJECT.id, thresholdType: 'PERCENT_80' });
    expect(await screen.findByText('Test alert recorded in-app')).toBeInTheDocument();
  });

  it('with a webhook the toast says it was queued for Slack, not that it was delivered', async () => {
    mockApi('QUEUED');
    await openSlackStep();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Send a real test alert/ })));
    expect(await screen.findByText('Test alert queued for Slack')).toBeInTheDocument();
  });
});
