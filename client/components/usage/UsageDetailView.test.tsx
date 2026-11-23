import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UsageDetailView } from './UsageDetailView';

const AI = '22222222-2222-4222-8222-222222222222';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

const log = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  projectName: 'Copilot',
  provider: 'OPENAI',
  model: 'gpt-4o-mini',
  totalTokens: 1600,
  costEstimate: 0.0012,
  statusCode: 200,
  isBlocked: false,
  isAnomaly: false,
  timestamp: '2026-11-20T13:45:09.000Z',
  ...over,
});

// authFetch only calls fetch when a session token exists
beforeEach(() => localStorage.setItem('spendguard_token', 'test-token'));
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem('spendguard_token');
});

const auditCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls
    .map((c) => new URL(String(c[0]), 'http://localhost'))
    .filter((u) => u.pathname === '/api/v1/audit');

describe('UsageDetailView (the page behind both charts)', () => {
  it('daily: loading, then that UTC day\'s requests from /api/v1/audit, with a way back', async () => {
    const fetchMock = vi.fn(() =>
      json({ logs: [log(), log({ id: 'r2', model: 'claude-x', provider: 'ANTHROPIC', isBlocked: true, costEstimate: 0 })], total: 2 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<UsageDetailView scopeId="" target={{ metric: 'daily', day: '2026-11-20' }} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading requests');
    expect(await screen.findByText('gpt-4o-mini')).toBeInTheDocument();
    expect(screen.getByText('claude-x')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getAllByText('2026-11-20 13:45:09')).toHaveLength(2);
    expect(screen.getByText(/2 requests/)).toBeInTheDocument();
    expect(screen.getByText('All projects')).toBeInTheDocument();

    const url = auditCalls(fetchMock)[0];
    expect(url.searchParams.get('startDate')).toBe('2026-11-20T00:00:00.000Z');
    expect(url.searchParams.get('endDate')).toBe('2026-11-20T23:59:59.999Z');
    expect(url.searchParams.get('projectId')).toBeNull();

    // back to the dashboard: breadcrumb link and button
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.querySelector('a')).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /Back to dashboard/ })).toHaveAttribute('href', '/dashboard');
  });

  it('model: the same view, filtered by model, and narrowed to the project in the route', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      String(input).includes('/api/v1/projects') ? json({ projects: [{ id: AI, name: 'Ai Chatbot' }] }) : json({ logs: [log()], total: 1 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<UsageDetailView scopeId={AI} target={{ metric: 'model', model: 'openai/gpt-oss-120b' }} />);

    expect(await screen.findByText('gpt-4o-mini')).toBeInTheDocument();
    const url = auditCalls(fetchMock)[0];
    expect(url.searchParams.get('model')).toBe('openai/gpt-oss-120b');
    expect(url.searchParams.get('projectId')).toBe(AI);
    expect(await screen.findByText('Ai Chatbot')).toBeInTheDocument(); // the scope chip names the project
  });

  it('shows an empty state when there are no requests', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ logs: [], total: 0 })));
    render(<UsageDetailView scopeId="" target={{ metric: 'daily', day: '2026-11-19' }} />);
    expect(await screen.findByText('No requests on this day')).toBeInTheDocument();
  });

  it('shows the error and retries on demand', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => json({ message: 'boom' }, 500))
      .mockImplementationOnce(() => json({ logs: [log()], total: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<UsageDetailView scopeId="" target={{ metric: 'daily', day: '2026-11-20' }} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('gpt-4o-mini')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('pages through a busy day with Load more (offset), appending rows', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const offset = new URL(String(input), 'http://localhost').searchParams.get('offset');
      return json(offset === '0' ? { logs: [log({ id: 'a', model: 'first-page' })], total: 2 } : { logs: [log({ id: 'b', model: 'second-page' })], total: 2 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<UsageDetailView scopeId="" target={{ metric: 'daily', day: '2026-11-20' }} />);
    expect(await screen.findByText('first-page')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getByText('second-page')).toBeInTheDocument());
    expect(screen.getByText('first-page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(auditCalls(fetchMock).map((u) => u.searchParams.get('offset'))).toEqual(['0', '1']);
  });
});
