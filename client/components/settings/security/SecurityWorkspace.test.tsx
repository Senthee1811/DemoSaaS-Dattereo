import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

import { Providers } from '@/app/providers';
import { SecurityWorkspace } from './SecurityWorkspace';
import { SettingsView } from '@/components/settings/SettingsView';
import { KeyVaultView } from '@/components/keys/KeyVaultView';
import { ScopeProvider } from '@/lib/scope';

const OVERVIEW = {
  email: 'alice@x.co',
  role: 'OWNER',
  organization: 'Acme',
  accountCreatedAt: '2026-01-01T00:00:00.000Z',
  password: { set: true, changedAt: '2026-11-01T10:00:00.000Z' },
  sessions: { active: 2, currentStartedAt: '2026-11-23T09:00:00.000Z', trackingAvailable: true },
  lastFailedSignInAt: null,
  mfa: { supported: false },
};
const SESSIONS = {
  currentSessionKnown: true,
  sessions: [
    { id: 'sess-current', device: 'Chrome on Windows', ip: '203.0.113.9', createdAt: '2026-11-23T09:00:00.000Z', lastUsedAt: '2026-11-23T09:30:00.000Z', expiresAt: '2026-11-30T09:00:00.000Z', current: true },
    { id: 'sess-phone', device: 'Safari on iOS', ip: '198.51.100.4', createdAt: '2026-11-20T08:00:00.000Z', lastUsedAt: '2026-11-22T20:00:00.000Z', expiresAt: '2026-11-27T08:00:00.000Z', current: false },
  ],
};
const EVENTS = (total = 2) => ({
  events: [
    { id: 'e1', type: 'PASSWORD_CHANGED', at: '2026-11-01T10:00:00.000Z', device: 'Chrome on Windows', ip: '203.0.113.9' },
    { id: 'e2', type: 'LOGIN_FAILED', at: '2026-10-30T10:00:00.000Z', device: null, ip: null },
  ],
  total,
  limit: 10,
  offset: 0,
});

interface Call { url: string; method: string; body?: unknown }
const calls: Call[] = [];
let overrides: Array<(url: string, method: string) => Response | undefined> = [];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calls.length = 0;
  overrides = [];
  replace.mockClear();
  localStorage.setItem('spendguard_token', 't');
  localStorage.setItem('spendguard_refresh_token', 'r');
  localStorage.setItem('spendguard_user', JSON.stringify({ name: 'Alice', email: 'alice@x.co', orgName: 'Acme', role: 'OWNER' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      for (const o of overrides) {
        const r = o(url, method);
        if (r) return r;
      }
      if (url.startsWith('/api/auth/security-activity')) return json(EVENTS());
      if (url.startsWith('/api/auth/security')) return json(OVERVIEW);
      if (url.startsWith('/api/auth/sessions/revoke-others')) return json({ success: true, revoked: 1 });
      if (url.startsWith('/api/auth/sessions/') && method === 'DELETE') return json({ success: true, revokedCurrent: url.includes('confirmCurrent') });
      if (url.startsWith('/api/auth/sessions')) return json(SESSIONS);
      if (url.startsWith('/api/auth/change-password')) return json({ success: true, passwordChangedAt: '2026-11-23T10:00:00.000Z', otherSessionsSignedOut: 1 });
      if (url.includes('/api/auth/account-status')) return json({ accountStatus: 'ACTIVE', organization: { memberCount: 2 }, ownershipConstraint: {} });
      if (url.includes('/api/v1/keys')) return json({ providerKeys: [{ id: 'k1', projectId: 'p1', provider: 'OPENAI', keyName: 'Prod', keyPrefix: 'sk-proj', isActive: true, lastUsedAt: '2026-11-22T10:00:00.000Z', createdAt: '2026-11-01T00:00:00.000Z' }], gatewayKeys: [] });
      return json({});
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const renderWorkspace = () =>
  render(
    <Providers>
      <SecurityWorkspace />
    </Providers>,
  );

describe('10.1 Security workspace shows real data in four sections', () => {
  it('renders overview, authentication, sessions and activity from the API', async () => {
    renderWorkspace();
    expect(await screen.findByText('Security overview')).toBeInTheDocument();
    expect(await screen.findByText('alice@x.co')).toBeInTheDocument();
    expect(screen.getByText('Authentication')).toBeInTheDocument();
    expect(await screen.findByText('Chrome on Windows', { selector: 'span.truncate' })).toBeInTheDocument();
    expect(screen.getByText('Safari on iOS', { selector: 'span.truncate' })).toBeInTheDocument();
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    expect(screen.getByText('Failed sign-in attempt')).toBeInTheDocument();
    expect(screen.getByText('This device')).toBeInTheDocument();
  });

  it('invents nothing: no security score, no MFA set-up button (it is not supported), no AES card', async () => {
    renderWorkspace();
    await screen.findByText('alice@x.co');
    const page = document.body.textContent ?? '';
    expect(page).not.toMatch(/\d+\s*%|security score/i);
    expect(page).not.toMatch(/AES-256|envelope/i);
    expect(screen.getAllByText('Not available').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /enable|set up|enroll|authenticator/i })).toBeNull();
  });

  it('a password never changed says so instead of inventing a date', async () => {
    overrides.push((url) => (url.startsWith('/api/auth/security') && !url.includes('activity') ? json({ ...OVERVIEW, password: { set: true, changedAt: null } }) : undefined));
    renderWorkspace();
    expect(await screen.findByText(/No change recorded since the account was created/)).toBeInTheDocument();
  });

  it('shows an error (not blank space) when a section cannot load', async () => {
    overrides.push((url) => (url.startsWith('/api/auth/sessions') ? json({ error: { message: 'Sessions unavailable' } }, 500) : undefined));
    renderWorkspace();
    expect(await screen.findByText('Could not load your sessions')).toBeInTheDocument();
    expect(screen.getByText('Sessions unavailable')).toBeInTheDocument();
  });

  it('the AES-256-GCM card is gone from account settings (Security tab) and lives in Key Vault, in plain language', async () => {
    const { unmount } = render(
      <Providers>
        <SettingsView initialTab="security" />
      </Providers>,
    );
    await screen.findByText('Security overview');
    expect(document.body.textContent).not.toMatch(/AES-256|Envelope|PBKDF2|Cryptography/i);
    unmount();

    render(
      <Providers>
        <ScopeProvider scopeId="" onScopeChange={() => {}} projects={[{ id: 'p1', name: 'Prod' }]}>
          <KeyVaultView />
        </ScopeProvider>
      </Providers>,
    );
    const card = await screen.findByRole('region', { name: 'Credential protection' });
    expect(within(card).getByText(/Encrypted at rest/)).toBeInTheDocument();
    expect(within(card).getByText(/does not rotate keys automatically/)).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/nonce|auth tag|iv\b/i);
  });
});

describe('10.1-B change password', () => {
  const openDialog = async () => {
    renderWorkspace();
    await screen.findByText('alice@x.co');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Change password' })));
    return screen.findByRole('dialog');
  };
  const fill = (dialog: HTMLElement, cur: string, next: string, confirm: string) => {
    fireEvent.change(within(dialog).getByLabelText('Current password'), { target: { value: cur } });
    fireEvent.change(within(dialog).getByLabelText('New password'), { target: { value: next } });
    fireEvent.change(within(dialog).getByLabelText('Confirm new password'), { target: { value: confirm } });
  };

  it('submit stays disabled until current, length, difference and confirmation are all satisfied', async () => {
    const dialog = await openDialog();
    const submit = within(dialog).getByRole('button', { name: 'Change password' });
    expect(submit).toBeDisabled();

    fill(dialog, 'OldPassword1', 'short', 'short');
    expect(submit).toBeDisabled();
    fill(dialog, 'OldPassword1', 'OldPassword1', 'OldPassword1'); // same as current
    expect(submit).toBeDisabled();
    fill(dialog, 'OldPassword1', 'BrandNewPass#1', 'different');
    expect(within(dialog).getByText('The two new passwords do not match.')).toBeInTheDocument();
    expect(submit).toBeDisabled();
    fill(dialog, 'OldPassword1', 'BrandNewPass#1', 'BrandNewPass#1');
    expect(submit).toBeEnabled();
  });

  it('show/hide toggles reveal each password field', async () => {
    const dialog = await openDialog();
    const field = within(dialog).getByLabelText('New password');
    expect(field).toHaveAttribute('type', 'password');
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: /Show new password/i })));
    expect(field).toHaveAttribute('type', 'text');
  });

  it('success: sends both passwords once, closes, says how many other sessions ended, and reloads the sections', async () => {
    const dialog = await openDialog();
    fill(dialog, 'OldPassword1', 'BrandNewPass#1', 'BrandNewPass#1');
    const before = calls.filter((c) => c.url.startsWith('/api/auth/security')).length;
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' })));

    const post = calls.find((c) => c.url === '/api/auth/change-password');
    expect(post?.method).toBe('POST');
    expect(post?.body).toEqual({ currentPassword: 'OldPassword1', newPassword: 'BrandNewPass#1' });
    // The toast, with its own text (the activity list also has a "Password changed" row)
    expect(await screen.findByText('1 other session was signed out.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(calls.filter((c) => c.url.startsWith('/api/auth/security')).length).toBeGreaterThan(before));
  });

  it('a wrong current password is shown on that field and the dialog stays open (never a fake success)', async () => {
    overrides.push((url) =>
      url === '/api/auth/change-password' ? json({ error: { message: 'Your current password is incorrect.', code: 'invalid_current_password' } }, 400) : undefined,
    );
    const dialog = await openDialog();
    fill(dialog, 'WrongPassword', 'BrandNewPass#1', 'BrandNewPass#1');
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' })));

    expect(await within(dialog).findByText('Your current password is incorrect.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('1 other session was signed out.')).toBeNull();
  });

  it('any other server refusal shows its message in the dialog', async () => {
    overrides.push((url) => (url === '/api/auth/change-password' ? json({ error: { message: 'Too many incorrect attempts. Try again in 15 minutes.' } }, 429) : undefined));
    const dialog = await openDialog();
    fill(dialog, 'OldPassword1', 'BrandNewPass#1', 'BrandNewPass#1');
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' })));
    expect(await within(dialog).findByText('Too many incorrect attempts. Try again in 15 minutes.')).toBeInTheDocument();
  });

  it('closing the dialog clears what was typed', async () => {
    const dialog = await openDialog();
    fill(dialog, 'OldPassword1', 'BrandNewPass#1', 'BrandNewPass#1');
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Change password' })));
    expect(within(await screen.findByRole('dialog')).getByLabelText('New password')).toHaveValue('');
  });
});

describe('10.1-C sessions', () => {
  it('signing out ANOTHER device asks first, then calls the API for exactly that session', async () => {
    renderWorkspace();
    await screen.findByText('Safari on iOS', { selector: 'span.truncate' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out Safari on iOS' })));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Sign out Safari on iOS?');
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false); // nothing yet

    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out device' })));
    const del = calls.find((c) => c.method === 'DELETE');
    expect(del?.url).toBe('/api/auth/sessions/sess-phone');
    expect(replace).not.toHaveBeenCalled(); // you stay signed in
  });

  it('signing out THIS device needs the explicit current-session confirmation, then leaves to the sign-in page', async () => {
    renderWorkspace();
    await screen.findByText('This device');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out of this device' })));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Sign out of this device?');
    expect(dialog).toHaveTextContent(/session you are using right now/);
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out here' })));

    expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('/api/auth/sessions/sess-current?confirmCurrent=true');
    expect(replace).toHaveBeenCalledWith('/login?signedOut=1');
    expect(localStorage.getItem('spendguard_token')).toBeNull(); // local session cleared
  });

  it('"Sign out others" confirms, then reports how many ended; it is disabled when there are none', async () => {
    renderWorkspace();
    await screen.findByText('Safari on iOS', { selector: 'span.truncate' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out others' })));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('This signs out 1 other session.');
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out others' })));

    expect(calls.find((c) => c.url === '/api/auth/sessions/revoke-others')?.method).toBe('POST');
    expect(await screen.findByText('1 other session signed out')).toBeInTheDocument();
  });

  it('with only this session, "Sign out others" is disabled', async () => {
    overrides.push((url, method) => (url === '/api/auth/sessions' && method === 'GET' ? json({ currentSessionKnown: true, sessions: [SESSIONS.sessions[0]] }) : undefined));
    renderWorkspace();
    await screen.findByText('This device');
    expect(screen.getByRole('button', { name: 'Sign out others' })).toBeDisabled();
  });

  it('a failed revocation keeps the dialog open with the real error', async () => {
    overrides.push((url, method) => (method === 'DELETE' ? json({ error: { message: 'Session not found' } }, 404) : undefined));
    renderWorkspace();
    await screen.findByText('Safari on iOS', { selector: 'span.truncate' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out Safari on iOS' })));
    await act(async () => fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sign out device' })));
    expect(within(screen.getByRole('alertdialog')).getByText('Session not found')).toBeInTheDocument();
  });

  it('a session started before tracking says so honestly', async () => {
    overrides.push((url, method) => (url === '/api/auth/sessions' && method === 'GET' ? json({ currentSessionKnown: false, sessions: [] }) : undefined));
    renderWorkspace();
    expect(await screen.findByText('This session is not tracked yet')).toBeInTheDocument();
  });
});

describe('10.1-D security activity', () => {
  it('shows times in the viewer\'s zone with the UTC instant on hover, and "Not you?" on failed sign-ins', async () => {
    renderWorkspace();
    await screen.findByText('Password changed');
    const time = document.querySelector('time[datetime="2026-11-01T10:00:00.000Z"]') as HTMLElement;
    expect(time).not.toBeNull();
    expect(time.getAttribute('title')).toBe('2026-11-01 10:00:00 UTC');
    expect(screen.getByText('Not you?')).toBeInTheDocument();
  });

  it('paginates through the API (limit/offset), never loading everything', async () => {
    overrides.push((url) => (url.startsWith('/api/auth/security-activity') ? json({ ...EVENTS(25), events: EVENTS().events }) : undefined));
    renderWorkspace();
    await screen.findByText('1-10 of 25');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Older events' })));
    await waitFor(() => expect(calls.some((c) => c.url.includes('offset=10'))).toBe(true));
    expect(calls.filter((c) => c.url.startsWith('/api/auth/security-activity')).every((c) => c.url.includes('limit=10'))).toBe(true);
  });

  it('an empty history says so', async () => {
    overrides.push((url) => (url.startsWith('/api/auth/security-activity') ? json({ events: [], total: 0, limit: 10, offset: 0 }) : undefined));
    renderWorkspace();
    expect(await screen.findByText('No security events recorded yet.')).toBeInTheDocument();
  });
});
