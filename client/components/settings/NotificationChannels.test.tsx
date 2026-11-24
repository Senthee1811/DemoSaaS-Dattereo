/**
 * Organization notification channels: credentials are write-only in the UI.
 *  - the signing secret appears once, right after creation, and is gone once dismissed or after a reload
 *  - the destination URL / recipients typed in are sent to the backend and never rendered back
 *  - non-admins get no manager at all
 *  - delivery history shows status, attempts and the reason a delivery failed
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotificationChannels } from './NotificationChannels';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const SECRET = 'whsec_0123456789abcdef0123456789abcdef0123456789abcdef';
const URL_TYPED = 'https://hooks.example.com/spendguard-private-path';

let channels: Array<Record<string, unknown>>;
let deliveries: Array<Record<string, unknown>>;
let posted: Array<{ url: string; body: { type?: string; name?: string; config?: unknown; eventTypes?: string[] } }>;

beforeEach(() => {
  localStorage.setItem('spendguard_token', 't');
  localStorage.setItem('spendguard_user', JSON.stringify({ name: 'Al', orgName: 'Acme', role: 'ADMIN' }));
  channels = [];
  deliveries = [];
  posted = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.endsWith('/api/v1/notifications/channels')) {
        const body = JSON.parse(String(init?.body));
        posted.push({ url, body });
        const row = { id: 'c1', type: body.type, name: body.name, destination: 'hooks.example.com/…', eventTypes: body.eventTypes, enabled: true, stats: { sent: 0, failed: 0, pending: 0 } };
        channels.push(row);
        return json({ ...row, signingSecret: SECRET }, 201);
      }
      if (url.includes('/api/v1/notifications/channels')) return json({ channels });
      if (url.includes('/api/v1/notifications/deliveries')) return json({ deliveries });
      return json({}, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const fill = (name: string, dest: string) => {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(/Destination URL/), { target: { value: dest } });
};

describe('NotificationChannels: duplicates, rotation, test-send', () => {
  it('shows server-side duplicate warnings on the channel row, with the channel still listed', async () => {
    channels.push({ id: 'c1', type: 'SLACK', name: 'Ops', destination: 'hooks.slack.com/…', eventTypes: [], enabled: true, warnings: ['Also the alert webhook of project "Support": budget alerts arrive twice.'], stats: { sent: 0, failed: 0, pending: 0 } });
    render(<NotificationChannels />);
    expect(await screen.findByTestId('channel-warning')).toHaveTextContent(/alert webhook of project "Support"/);
    expect(screen.getAllByTestId('channel-row')).toHaveLength(1);
  });

  it('after creating a channel that duplicates another, the warning is shown prominently and the channel exists', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? 'GET') === 'POST' && url.endsWith('/channels')) return json({ id: 'c2', type: 'WEBHOOK', name: 'Copy', warnings: ['Same destination as "Pager": each event will be delivered to it more than once.'], signingSecret: SECRET }, 201);
      if (url.includes('/channels')) return json({ channels });
      return json({ deliveries });
    });
    render(<NotificationChannels />);
    await screen.findByText(/No channels yet/);
    fill('Copy', URL_TYPED);
    fireEvent.click(screen.getByRole('button', { name: 'Add channel' }));
    expect(await screen.findByTestId('create-warnings')).toHaveTextContent(/Same destination as "Pager"/);
  });

  it('rotation tells the admin how long the previous secret keeps working', async () => {
    channels.push({ id: 'c1', type: 'WEBHOOK', name: 'Pager', destination: 'hooks.example.com/…', eventTypes: [], enabled: true, stats: { sent: 0, failed: 0, pending: 0 } });
    let rotateBody: unknown;
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInit | URL | string, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/rotate-secret')) {
        rotateBody = JSON.parse(String(init?.body));
        return json({ signingSecret: SECRET, previousSecretValidUntil: '2026-11-26T10:00:00Z' }, 201);
      }
      if (url.includes('/channels')) return json({ channels });
      return json({ deliveries });
    });
    render(<NotificationChannels />);
    await screen.findAllByTestId('channel-row');
    fireEvent.click(screen.getByRole('button', { name: 'Rotate secret' }));
    await waitFor(() => expect(screen.getByTestId('signing-secret')).toHaveTextContent(SECRET));
    expect(rotateBody).toEqual({ immediate: false });
    expect(screen.getByTestId('rotation-note')).toHaveTextContent(/previous secret keeps verifying until/);
  });

  it('revoking immediately needs a confirmation and then sends immediate: true', async () => {
    channels.push({ id: 'c1', type: 'WEBHOOK', name: 'Pager', destination: 'hooks.example.com/…', eventTypes: [], enabled: true, stats: { sent: 0, failed: 0, pending: 0 } });
    let rotateBody: unknown = null;
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/rotate-secret')) {
        rotateBody = JSON.parse(String(init?.body));
        return json({ signingSecret: SECRET, previousSecretValidUntil: null }, 201);
      }
      if (url.includes('/channels')) return json({ channels });
      return json({ deliveries });
    });
    render(<NotificationChannels />);
    await screen.findAllByTestId('channel-row');
    fireEvent.click(screen.getByRole('button', { name: /Revoke & rotate/ }));
    expect(rotateBody).toBeNull(); // nothing happens before confirming
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke and rotate' }));
    await waitFor(() => expect(rotateBody).toEqual({ immediate: true }));
    await waitFor(() => expect(screen.getByTestId('rotation-note')).toHaveTextContent(/no longer verifies/));
  });

  it('test-send on a paused channel says so instead of claiming it was queued', async () => {
    channels.push({ id: 'c1', type: 'WEBHOOK', name: 'Pager', destination: 'x', eventTypes: [], enabled: false, stats: { sent: 0, failed: 0, pending: 0 } });
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/test')) return json({ queued: false }, 201);
      if (url.includes('/channels')) return json({ channels });
      return json({ deliveries });
    });
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined); // toasts degrade to console.info outside a provider
    render(<NotificationChannels />);
    await screen.findAllByTestId('channel-row');
    fireEvent.click(screen.getByRole('button', { name: /Test/ }));
    await waitFor(() => expect(info).toHaveBeenCalledWith('Test not sent', expect.stringMatching(/paused/)));
    expect(info).not.toHaveBeenCalledWith('Test queued', expect.anything());
    info.mockRestore();
  });
});

describe('NotificationChannels', () => {
  it('members get no manager, only an explanation', () => {
    localStorage.setItem('spendguard_user', JSON.stringify({ name: 'Mo', orgName: 'Acme', role: 'MEMBER' }));
    render(<NotificationChannels />);
    expect(screen.getByText(/Only an owner or admin can manage/)).toBeInTheDocument();
    expect(screen.queryByTestId('notification-channels')).toBeNull();
  });

  it('shows the signing secret ONCE after creating a webhook, and never the destination URL', async () => {
    render(<NotificationChannels />);
    await screen.findByText(/No channels yet/);
    fill('Pager', URL_TYPED);
    fireEvent.click(screen.getByRole('button', { name: 'Add channel' }));

    await waitFor(() => expect(screen.getByTestId('signing-secret')).toHaveTextContent(SECRET));
    expect(posted[0].body).toMatchObject({ type: 'WEBHOOK', name: 'Pager', config: { url: URL_TYPED }, eventTypes: ['budget.alert', 'recommendation.created'] });
    await waitFor(() => expect(screen.getAllByTestId('channel-row')).toHaveLength(1));
    expect(document.body.textContent).not.toContain(URL_TYPED); // only the non-sensitive hint is shown
    expect(screen.getByText(/hooks.example.com/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'I have stored it' }));
    expect(screen.queryByTestId('signing-secret')).toBeNull();
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it('after a "reload" (fresh mount) the secret is nowhere to be found', async () => {
    channels.push({ id: 'c1', type: 'WEBHOOK', name: 'Pager', destination: 'hooks.example.com/…', eventTypes: [], enabled: true, stats: { sent: 3, failed: 0, pending: 0 } });
    render(<NotificationChannels />);
    await screen.findAllByTestId('channel-row');
    expect(document.body.textContent).not.toContain('whsec_');
    expect(screen.getByText(/all events · 3 sent/)).toBeInTheDocument();
  });

  it('email channels send recipients (split on commas/spaces), not a URL', async () => {
    render(<NotificationChannels />);
    await screen.findByText(/No channels yet/);
    fireEvent.change(screen.getByLabelText(/^Type/), { target: { value: 'EMAIL' } });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Finance' } });
    fireEvent.change(screen.getByLabelText(/Recipients/), { target: { value: 'cfo@example.com, cto@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add channel' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body.config).toEqual({ recipients: ['cfo@example.com', 'cto@example.com'] });
  });

  it('delivery history shows status, attempts and why a delivery failed, with Retry only for failures', async () => {
    deliveries.push(
      { id: 'd1', channelName: 'Pager', channelType: 'WEBHOOK', eventType: 'budget.alert', title: 'Budget warning: Support', status: 'FAILED', attempts: 1, lastError: 'The destination answered HTTP 404', createdAt: '2026-11-25T10:00:00Z' },
      { id: 'd2', channelName: 'Pager', channelType: 'WEBHOOK', eventType: 'budget.alert', title: 'Another', status: 'SENT', attempts: 1, lastError: null, createdAt: '2026-11-25T09:00:00Z' },
    );
    render(<NotificationChannels />);
    await screen.findByText('The destination answered HTTP 404');
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('sent')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
  });

  it('a rejected destination shows the backend\'s reason and adds nothing', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => json({ channels: [] })).mockImplementationOnce(async () => json({ deliveries: [] }));
    render(<NotificationChannels />);
    await screen.findByText(/No channels yet/);
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => json({ error: { message: 'The URL points to a private or internal network address, which is not allowed.' } }, 400));
    fill('Bad', 'https://169.254.169.254/latest');
    fireEvent.click(screen.getByRole('button', { name: 'Add channel' }));
    await waitFor(() => expect(screen.queryByTestId('signing-secret')).toBeNull());
    expect(screen.queryAllByTestId('channel-row')).toHaveLength(0);
  });
});
