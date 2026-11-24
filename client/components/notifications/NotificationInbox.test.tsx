import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { ScopeProvider } from '@/lib/scope';
import { NotificationInbox, destinationFor, type InboxItem } from './NotificationInbox';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const PROJECTS = [{ id: 'p1', name: 'Support' }];

let items: InboxItem[];
let nextCursor: string | null;
let calls: Array<{ url: string; method: string; body?: { ids?: string[] } }>;
let failList = false;

beforeEach(() => {
  localStorage.setItem('spendguard_token', 't');
  items = [];
  nextCursor = null;
  calls = [];
  failList = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes('/inbox/unread-count')) return json({ unread: items.filter((i) => !i.readAt).length });
      if (url.includes('/inbox/read')) {
        const ids: string[] | undefined = JSON.parse(String(init?.body ?? '{}')).ids;
        items = items.map((i) => (!ids || ids.includes(i.id) ? { ...i, readAt: 'now' } : i));
        return json({ updated: 1 });
      }
      if (url.includes('/api/v1/notifications/inbox')) {
        if (failList) return json({ error: { message: 'boom' } }, 500);
        return json({ unread: items.filter((i) => !i.readAt).length, items, nextCursor });
      }
      return json({}, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function Harness({ initial = 0, onNavigate = () => {}, projects = PROJECTS }: { initial?: number; onNavigate?: (t: string) => void; projects?: Array<{ id: string; name: string }> }) {
  const [unread, setUnread] = useState(initial);
  return (
    <ScopeProvider scopeId="" onScopeChange={() => {}} projects={projects as never}>
      <NotificationInbox unread={unread} onUnreadChange={setUnread} onNavigate={onNavigate as never} />
    </ScopeProvider>
  );
}
const open = () => fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }));

describe('NotificationInbox', () => {
  it('shows the unread count on the bell, capped, and no badge at zero', () => {
    render(<Harness initial={3} />);
    expect(screen.getByTestId('inbox-badge')).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: 'Notifications, 3 unread' })).toBeInTheDocument();
    cleanup();
    render(<Harness initial={250} />);
    expect(screen.getByTestId('inbox-badge')).toHaveTextContent('99+');
    cleanup();
    render(<Harness initial={0} />);
    expect(screen.queryByTestId('inbox-badge')).toBeNull();
  });

  it('loads nothing until opened (closed it costs no request)', () => {
    render(<Harness initial={2} />);
    expect(calls).toHaveLength(0);
  });

  it('lists severity, title, summary and time; unread items are marked', async () => {
    items = [
      { id: 'a', eventType: 'budget.alert', title: 'Budget warning: Support', message: 'Support used 85% of its monthly budget.', severity: 'warning', createdAt: '2026-11-25T10:00:00Z', projectId: 'p1' },
      { id: 'b', eventType: 'recommendation.created', title: 'Spend increase', message: 'm', severity: 'info', createdAt: '2026-11-24T10:00:00Z', readAt: '2026-11-24T11:00:00Z' },
    ];
    render(<Harness initial={1} />);
    open();
    const rows = await screen.findAllByTestId('inbox-item');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-unread', 'true');
    expect(rows[1]).toHaveAttribute('data-unread', 'false');
    expect(screen.getByText('Budget warning: Support')).toBeInTheDocument();
    expect(screen.getByText('warning')).toBeInTheDocument();
  });

  it('empty, loading and error states', async () => {
    render(<Harness />);
    open();
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(await screen.findByText(/all caught up/)).toBeInTheDocument();
    cleanup();

    failList = true;
    render(<Harness />);
    open();
    expect(await screen.findByText('Notifications unavailable')).toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    failList = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/all caught up/)).toBeInTheDocument();
  });

  it('mark as read updates the row and the badge from the server count', async () => {
    items = [{ id: 'a', eventType: 'budget.alert', title: 'One', severity: 'info', createdAt: '2026-11-25T10:00:00Z' }, { id: 'b', eventType: 'budget.alert', title: 'Two', severity: 'info', createdAt: '2026-11-25T09:00:00Z' }];
    render(<Harness initial={2} />);
    open();
    await screen.findAllByTestId('inbox-item');
    fireEvent.click(screen.getAllByRole('button', { name: 'Mark as read' })[0]);
    await waitFor(() => expect(screen.getByTestId('inbox-badge')).toHaveTextContent('1'));
    expect(calls.find((c) => c.url.endsWith('/inbox/read'))?.body).toEqual({ ids: ['a'] });
  });

  it('mark all as read sends no ids, clears the badge, and is disabled at zero', async () => {
    items = [{ id: 'a', eventType: 'budget.alert', title: 'One', createdAt: '2026-11-25T10:00:00Z' }];
    render(<Harness initial={1} />);
    open();
    await screen.findAllByTestId('inbox-item');
    fireEvent.click(screen.getByRole('button', { name: /Mark all as read/ }));
    await waitFor(() => expect(screen.queryByTestId('inbox-badge')).toBeNull());
    expect(calls.find((c) => c.url.endsWith('/inbox/read'))?.body).toEqual({});
    expect(screen.getByRole('button', { name: /Mark all as read/ })).toBeDisabled();
  });

  it('pages: "Load older" appends with the cursor and disappears on the last page', async () => {
    items = [{ id: 'a', title: 'First', createdAt: '2026-11-25T10:00:00Z' }];
    nextCursor = '2026-11-25T10:00:00.000Z';
    render(<Harness />);
    open();
    await screen.findByText('First');
    items = [{ id: 'b', title: 'Second', createdAt: '2026-11-24T10:00:00Z' }];
    nextCursor = null;
    fireEvent.click(screen.getByRole('button', { name: 'Load older' }));
    await screen.findByText('Second');
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(calls.at(-1)?.url).toContain('cursor=2026-11-25T10%3A00%3A00.000Z');
    expect(screen.queryByRole('button', { name: 'Load older' })).toBeNull();
  });

  it('links to the alert or recommendation, marking it read and closing the panel; a deleted project is explained, not linked', async () => {
    items = [
      { id: 'a', eventType: 'budget.alert', title: 'Alert', createdAt: '2026-11-25T10:00:00Z', projectId: 'p1' },
      { id: 'g', eventType: 'budget.alert', title: 'Old alert', createdAt: '2026-11-24T10:00:00Z', projectId: 'deleted-project' },
    ];
    const nav = vi.fn();
    render(<Harness initial={2} onNavigate={nav} />);
    open();
    await screen.findAllByTestId('inbox-item');
    expect(screen.getByText('This project no longer exists.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'View alerts' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'View alerts' }));
    expect(nav).toHaveBeenCalledWith('alerts');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/inbox/read') && c.body?.ids?.[0] === 'a')).toBe(true));
  });

  it('tolerates a malformed response (no items array, junk entries) without crashing', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => json({ items: [null, 5, { nope: true }, { id: 'ok', title: 'Fine' }], unread: 'x' }));
    render(<Harness />);
    open();
    expect(await screen.findByText('Fine')).toBeInTheDocument();
    expect(screen.getAllByTestId('inbox-item')).toHaveLength(1);
  });

  it('Escape closes the panel and returns focus to the bell', async () => {
    render(<Harness />);
    open();
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /^Notifications/ })).toHaveFocus();
  });
});

describe('destinationFor', () => {
  it('maps event types to tabs and ignores unknown ones', () => {
    expect(destinationFor({ id: '1', eventType: 'budget.alert' }, null)).toMatchObject({ tab: 'alerts' });
    expect(destinationFor({ id: '1', eventType: 'recommendation.created' }, null)).toMatchObject({ tab: 'insights' });
    expect(destinationFor({ id: '1', eventType: 'notification.test' }, null)).toBeNull();
  });
  it('does not call a project gone while projects have not loaded yet', () => {
    expect(destinationFor({ id: '1', eventType: 'budget.alert', projectId: 'x' }, null)).toMatchObject({ tab: 'alerts' });
    expect(destinationFor({ id: '1', eventType: 'budget.alert', projectId: 'x' }, ['y'])).toEqual({ gone: expect.any(String) });
  });
});
