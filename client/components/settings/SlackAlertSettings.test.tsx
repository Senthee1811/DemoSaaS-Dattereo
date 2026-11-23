/**
 * 11.4 regression: a saved Slack webhook must show as configured, from real backend state.
 *
 * The fake backend below is stateful like the real one: PATCH stores the webhook, GET reports it
 * (as booleans only, never the URL). Unmounting and mounting again stands in for a page reload:
 * all local component state is gone, so only what the backend holds can make it say "Configured".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ScopeProvider } from '@/lib/scope';
import { SlackAlertSettings, MASKED_WEBHOOK, slackStatus } from './SlackAlertSettings';

const PROJECT = { id: '11111111-1111-4111-8111-111111111111', name: 'ProductionA' };
const VALID_URL = 'https://hooks.slack.com/services/T000/B000/XXXX';

let backend: { url: string | null; last: 'SENT' | 'FAILED' | null };
let getCount: number;

function mockBackend() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input);
      const method = init?.method || 'GET';
      const view = () => ({
        projectId: PROJECT.id,
        slackUrlSaved: backend.url !== null,
        slackConfigured: backend.url !== null && backend.last === 'SENT',
        lastSlackStatus: backend.url ? backend.last : null,
        lastSlackError: null,
      });
      if (u.includes('/api/v1/alerts/config')) {
        if (method === 'PATCH') {
          const body = JSON.parse(String(init?.body));
          backend.url = body.slackWebhookUrl;
        } else getCount += 1;
        return new Response(JSON.stringify(view()), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }),
  );
}

const mountForm = () =>
  render(
    <ScopeProvider scopeId={PROJECT.id} onScopeChange={() => undefined} projects={[PROJECT]}>
      <SlackAlertSettings />
    </ScopeProvider>,
  );

beforeEach(() => {
  localStorage.setItem('spendguard_token', 'test-token');
  backend = { url: null, last: null };
  getCount = 0;
  mockBackend();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Slack webhook status (11.4)', () => {
  it('shows Configured right after saving, with no page reload, and keeps showing it after a reload', async () => {
    const first = mountForm();
    await waitFor(() => expect(screen.getByTestId('slack-status')).toHaveTextContent('Not configured'));

    fireEvent.change(screen.getByLabelText('Slack Incoming Webhook URL'), { target: { value: VALID_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Save webhook' }));

    // No reload: the card flips on its own, with the masked placeholder in the empty field.
    await waitFor(() => expect(screen.getByTestId('slack-status')).toHaveTextContent('Configured'));
    expect(screen.getByTestId('slack-status')).not.toHaveTextContent('Not configured');
    expect(screen.getByLabelText('Slack Incoming Webhook URL')).toHaveAttribute('placeholder', MASKED_WEBHOOK);
    expect(backend.url).toBe(VALID_URL);

    // Reload: every bit of local state is discarded; only the backend can say "Configured" now.
    first.unmount();
    mountForm();
    await waitFor(() => expect(screen.getByTestId('slack-status')).toHaveTextContent('Configured'));
    expect(screen.getByLabelText('Slack Incoming Webhook URL')).toHaveAttribute('placeholder', MASKED_WEBHOOK);
    // and the real URL is never put into the page
    expect(document.body.innerHTML).not.toContain('T000/B000');
  });

  it('re-reads the backend after a save, so the card never rests on local state alone', async () => {
    mountForm();
    await waitFor(() => expect(getCount).toBe(1));
    fireEvent.change(screen.getByLabelText('Slack Incoming Webhook URL'), { target: { value: VALID_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Save webhook' }));
    await waitFor(() => expect(getCount).toBe(2)); // the reconcile fetch
  });

  it('picks up a delivery that succeeded while the page was open when the tab regains focus', async () => {
    backend = { url: VALID_URL, last: null };
    mountForm();
    await waitFor(() => expect(screen.getByTestId('slack-status')).toHaveTextContent('Not tested yet'));

    backend.last = 'SENT'; // a real alert goes out in the background
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(screen.getByTestId('slack-status')).toHaveTextContent('Last delivery: sent'));
    expect(screen.getByTestId('slack-status')).toHaveTextContent('Configured');
  });

  it('keeps "Configured" when the last delivery failed, and says so separately', () => {
    const s = slackStatus({ slackUrlSaved: true, slackConfigured: false, lastSlackStatus: 'FAILED', lastSlackError: 'x' });
    expect(s?.label).toBe('Configured');
    expect(s?.detail).toMatch(/failed/i);
    expect(slackStatus({ slackUrlSaved: false, slackConfigured: false, lastSlackStatus: null, lastSlackError: null })?.label).toBe('Not configured');
  });
});
