import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DayRequestsPanel, utcDayRange } from './DayRequestsPanel';

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

describe('utcDayRange', () => {
  it('covers exactly one UTC day, whatever the browser time zone', () => {
    expect(utcDayRange('2026-11-20')).toEqual({
      startDate: '2026-11-20T00:00:00.000Z',
      endDate: '2026-11-20T23:59:59.999Z',
    });
  });
});

describe('DayRequestsPanel', () => {
  it('shows a loading state, then the requests of that UTC day from /api/v1/audit', async () => {
    const fetchMock = vi.fn(() => json({ logs: [log(), log({ id: 'r2', model: 'claude-x', provider: 'ANTHROPIC', isBlocked: true, costEstimate: 0 })], total: 2 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<DayRequestsPanel day="2026-11-20" onClose={() => {}} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading requests');
    expect(await screen.findByText('gpt-4o-mini')).toBeInTheDocument();
    expect(screen.getByText('claude-x')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getAllByText('2026-11-20 13:45:09')).toHaveLength(2);
    expect(screen.getByText(/2 requests/)).toBeInTheDocument();

    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), 'http://localhost');
    expect(url.pathname).toBe('/api/v1/audit');
    expect(url.searchParams.get('startDate')).toBe('2026-11-20T00:00:00.000Z');
    expect(url.searchParams.get('endDate')).toBe('2026-11-20T23:59:59.999Z');
  });

  it('shows an empty state when the day has no requests', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ logs: [], total: 0 })));
    render(<DayRequestsPanel day="2026-11-19" onClose={() => {}} />);
    expect(await screen.findByText('No requests on this day')).toBeInTheDocument();
  });

  it('shows the error and retries on demand', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => json({ message: 'boom' }, 500))
      .mockImplementationOnce(() => json({ logs: [log()], total: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<DayRequestsPanel day="2026-11-20" onClose={() => {}} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('gpt-4o-mini')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('closes on Escape and on the close button', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ logs: [], total: 0 })));
    const onClose = vi.fn();
    render(<DayRequestsPanel day="2026-11-20" onClose={onClose} />);
    await waitFor(() => expect(screen.getByText('No requests on this day')).toBeInTheDocument());

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('notes when only the first page of a busy day is shown', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ logs: [log()], total: 450 })));
    render(<DayRequestsPanel day="2026-11-20" onClose={() => {}} />);
    expect(await screen.findByText(/450 requests/)).toHaveTextContent('first 1');
  });
});
