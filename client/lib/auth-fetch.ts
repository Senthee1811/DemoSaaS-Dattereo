'use client';

/**
 * Browser-side fetch wrapper for authenticated SpendGuard API calls.
 *
 * - Attaches the current access token as `Authorization: Bearer ...`
 * - On 401, transparently refreshes the session once and retries
 * - If the session cannot be restored, clears it and redirects to /login
 *
 * Access tokens are short-lived (15m), so without refresh every dashboard
 * session would silently start failing after a quarter of an hour.
 */

const TOKEN_KEY = 'spendguard_token';
const REFRESH_KEY = 'spendguard_refresh_token';
const USER_KEY = 'spendguard_user';

let refreshInFlight: Promise<string | null> | null = null;

function readStorage(key: string): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return readStorage(TOKEN_KEY);
}

export function saveSession(data: { accessToken?: string; refreshToken?: string; user?: unknown }) {
  try {
    if (data.accessToken) localStorage.setItem(TOKEN_KEY, data.accessToken);
    if (data.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken);
    if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  } catch {
    /* storage unavailable (private mode) — session lasts for this page only */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

/** Sends the user to the login page, remembering where they were. */
export function redirectToLogin(reason: 'expired' | 'required' = 'expired') {
  if (typeof window === 'undefined') return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?${reason}=1&next=${next}`;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = readStorage(REFRESH_KEY);
  if (!refreshToken) return null;

  // De-duplicate concurrent refreshes (several panels load at once on the dashboard)
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        saveSession(data);
        return data.accessToken ?? null;
      } catch {
        return null;
      } finally {
        // Allow a later refresh once this one settles
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      }
    })();
  }
  return refreshInFlight;
}

function withAuth(init: RequestInit | undefined, token: string | null): RequestInit {
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init?.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return { ...init, headers };
}

export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = getAccessToken();
  if (!token) {
    redirectToLogin('required');
    // Return a well-formed 401 so callers' error paths run instead of throwing
    return new Response(JSON.stringify({ error: { message: 'Please sign in to continue.' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let res = await fetch(input, withAuth(init, token));
  if (res.status !== 401) return res;

  const fresh = await refreshAccessToken();
  if (!fresh) {
    clearSession();
    redirectToLogin('expired');
    return res;
  }

  res = await fetch(input, withAuth(init, fresh));
  if (res.status === 401) {
    clearSession();
    redirectToLogin('expired');
  }
  return res;
}

/** Extracts a human-readable error message from any SpendGuard API error body. */
export async function readApiError(res: Response, fallback = 'Something went wrong. Please try again.'): Promise<string> {
  try {
    const data = await res.clone().json();
    const message = data?.error?.message ?? data?.message;
    if (Array.isArray(message)) return message.join('; ');
    if (typeof message === 'string' && message) return message;
  } catch {
    /* non-JSON body */
  }
  return fallback;
}
