/**
 * 10.8 + 10.9 regression: the Scope dropdown is global.
 *
 * Both bugs had one root cause: sections kept their own idea of "the current project" (the first
 * project, or a local picker) instead of reading the shared scope. So they are tested together,
 * against the real dashboard, with the OTHER project listed first: the old code picked it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

import { Providers } from '@/app/providers';
import DashboardPage from './page';

const PRODUCTION_A = { id: '11111111-1111-4111-8111-111111111111', name: 'ProductionA' };
const AI_CHATBOT = { id: '22222222-2222-4222-8222-222222222222', name: 'Ai Chatbot' };

const project = (p: { id: string; name: string }) => ({
  ...p,
  slug: p.name.toLowerCase().replace(/\s+/g, '-'),
  budgetMonthly: 100,
  budgetHardBlockEnabled: true,
  isBlocked: false,
  currentMonthlySpend: 5,
  currentWeeklySpend: 1,
  utilizationPct: 5,
  requestCount: 3,
});

interface Recorded {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
  headers: Record<string, string>;
}
const requests: Recorded[] = [];

function mockApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || 'GET';
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
      requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers });

      let body: unknown = {};
      if (url.includes('/api/v1/projects')) body = { projects: [project(PRODUCTION_A), project(AI_CHATBOT)] }; // ProductionA FIRST
      else if (url.includes('/api/v1/alerts/config')) body = { slackUrlSaved: false, slackConfigured: false, lastSlackStatus: null, lastSlackError: null };
      else if (url.includes('/api/v1/alerts') && method === 'POST') body = { alert: { id: 'a1', status: 'IN_APP' } };
      else if (url.includes('/api/v1/alerts')) body = { alerts: [] };
      else if (url.includes('/api/v1/keys')) body = { providerKeys: [], gatewayKeys: [] };
      else if (url.includes('/api/v1/analytics')) body = { summary: {}, dailySpend: [], modelBreakdown: [], projectBreakdown: [], recentRequests: [] };
      else if (url.includes('/api/v1/audit')) body = { logs: [], total: 0 };
      else if (url.includes('/api/v1/pricing'))
        body = {
          data: [{ model: 'm1', provider: 'OPENAI', displayName: 'Model One', inputPricePerMillion: 1, outputPricePerMillion: 2, cachedInputPrice: null, contextWindow: null, source: 'manual', updatedAt: '2026-11-18T10:00:00.000Z', providerStatus: null, retiresAt: null }],
          meta: {},
        };
      else if (url.includes('/api/v1/chat/completions')) body = { choices: [{ message: { content: 'ok' } }] };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

const callsTo = (fragment: string, method?: string) => requests.filter((r) => r.url.includes(fragment) && (!method || r.method === method));
const lastGet = (fragment: string) => callsTo(fragment, 'GET').at(-1);

async function goTo(label: RegExp) {
  const nav = screen.getByRole('navigation');
  await act(async () => fireEvent.click(within(nav).getByRole('button', { name: label })));
}

// "Notifications" is also the header bell's name, so look inside the page content only
async function openNotificationsTab() {
  const main = screen.getByRole('main');
  await act(async () => fireEvent.click(await within(main).findByRole('button', { name: /^Notifications$/ })));
}

async function openDashboardAndSetScope(name: string) {
  render(
    <Providers>
      <DashboardPage />
    </Providers>,
  );
  const select = (await screen.findByLabelText('Scope Project Selection')) as HTMLSelectElement;
  await waitFor(() => expect(within(select).getAllByRole('option').length).toBe(3)); // All + 2 projects
  const option = within(select).getByRole('option', { name });
  await act(async () => fireEvent.change(select, { target: { value: (option as HTMLOptionElement).value } }));
}

beforeEach(() => {
  requests.length = 0;
  localStorage.setItem('spendguard_token', 't');
  localStorage.setItem('spendguard_user', JSON.stringify({ name: 'Alice', orgName: 'Acme', role: 'OWNER' }));
  localStorage.setItem('spendguard_onboarding_state', 'ONBOARDING_COMPLETED');
  localStorage.setItem('spendguard_tour_completed', 'true');
  mockApi();
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('10.9 the Scope dropdown is global: every project-scoped section reflects it', () => {
  it('Dashboard (Overview) loads analytics for the scoped project', async () => {
    await openDashboardAndSetScope('Ai Chatbot');
    await waitFor(() => expect(lastGet('/api/v1/analytics')?.url).toContain(`projectId=${AI_CHATBOT.id}`));
  });

  it('Projects & Budgets shows only the scoped project', async () => {
    await openDashboardAndSetScope('Ai Chatbot');
    await goTo(/Projects & Budgets/);
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Ai Chatbot')).toBeInTheDocument();
    expect(within(table).queryByText('ProductionA')).toBeNull();
  });

  it('Test Bench sends to the scoped project (no separate project picker)', async () => {
    await openDashboardAndSetScope('Ai Chatbot');
    await goTo(/Test Bench/);
    expect(await screen.findByText('Project:')).toBeInTheDocument();
    expect(screen.getByText('Ai Chatbot', { selector: 'span.truncate' })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).queryByRole('combobox', { name: /project/i })).toBeNull();

    const send = await screen.findByRole('button', { name: /Send Request via SpendGuard Gateway/ });
    await waitFor(() => expect(send).toBeEnabled()); // waits for the model list
    await act(async () => fireEvent.click(send));

    const post = callsTo('/api/v1/chat/completions', 'POST').at(-1);
    expect(post?.body?.projectId).toBe(AI_CHATBOT.id);
    expect(post?.headers['x-spendguard-project-id']).toBe(AI_CHATBOT.id);
  });

  it('Alerts & Anomalies lists the scoped project and names it as the test-alert target', async () => {
    await openDashboardAndSetScope('Ai Chatbot');
    await goTo(/Alerts & Anomalies/);
    await waitFor(() => expect(lastGet('/api/v1/alerts?')?.url).toContain(`projectId=${AI_CHATBOT.id}`));
    fireEvent.click(await screen.findByRole('button', { name: /Test Alert/ }));
    expect(await screen.findByText(/Sends to/)).toHaveTextContent('Ai Chatbot');
    expect(screen.getByText(/Sends to/)).toHaveTextContent('your current Scope');
  });

  it('Audit Ledger filters by the scoped project, with no separate project filter', async () => {
    await openDashboardAndSetScope('Ai Chatbot');
    await goTo(/Audit Ledger/);
    await waitFor(() => expect(lastGet('/api/v1/audit')?.url).toContain(`projectId=${AI_CHATBOT.id}`));
    expect(screen.getByText('Ai Chatbot', { selector: 'span.truncate' })).toBeInTheDocument();
  });

  it('Notifications shows the scoped project and loads ITS Slack config', async () => {
    await openDashboardAndSetScope('Ai Chatbot');
    await goTo(/Settings & Account/);
    await openNotificationsTab();
    expect(await screen.findByText('Ai Chatbot', { selector: 'span.font-semibold' })).toBeInTheDocument();
    await waitFor(() => expect(lastGet('/api/v1/alerts/config')?.url).toContain(`projectId=${AI_CHATBOT.id}`));
    expect(callsTo('/api/v1/alerts/config').every((r) => !r.url.includes(PRODUCTION_A.id))).toBe(true);
  });

  it('switching Scope again moves every section with it', async () => {
    await openDashboardAndSetScope('Ai Chatbot');
    await goTo(/Settings & Account/);
    await openNotificationsTab();
    await screen.findByText('Ai Chatbot', { selector: 'span.font-semibold' });

    const select = screen.getByLabelText('Scope Project Selection') as HTMLSelectElement;
    await act(async () => fireEvent.change(select, { target: { value: PRODUCTION_A.id } }));
    expect(await screen.findByText('ProductionA', { selector: 'span.font-semibold' })).toBeInTheDocument();
    await waitFor(() => expect(lastGet('/api/v1/alerts/config')?.url).toContain(`projectId=${PRODUCTION_A.id}`));
  });
});

describe('10.8 the test alert targets the project in Scope, not the first/default one', () => {
  it('Scope = Ai Chatbot → Notifications → Send test alert → POST names Ai Chatbot (ProductionA is listed first)', async () => {
    // The Slack form only offers "Send test alert" with a saved webhook
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/v1/alerts/config')) {
        requests.push({ url: String(input), method: 'GET', body: undefined, headers: {} });
        return new Response(JSON.stringify({ slackUrlSaved: true, slackConfigured: true, lastSlackStatus: 'SENT', lastSlackError: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return original(input, init);
    });

    await openDashboardAndSetScope('Ai Chatbot');
    await goTo(/Settings & Account/);
    await openNotificationsTab();
    const send = await screen.findByRole('button', { name: /^Send test alert$/ });
    await waitFor(() => expect(send).toBeEnabled());
    await act(async () => fireEvent.click(send));

    const post = callsTo('/api/v1/alerts', 'POST').at(-1);
    expect(post?.body?.projectId).toBe(AI_CHATBOT.id);
    expect(post?.body?.projectId).not.toBe(PRODUCTION_A.id);
  });

  it('with Scope = All projects the first project is used, and the UI says so', async () => {
    render(
      <Providers>
        <DashboardPage />
      </Providers>,
    );
    await screen.findByLabelText('Scope Project Selection');
    await goTo(/Settings & Account/);
    await openNotificationsTab();
    expect(await screen.findByText(/first project: pick one in Scope to change it/)).toBeInTheDocument();
  });
});
