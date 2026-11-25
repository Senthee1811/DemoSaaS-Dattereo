/**
 * The opt-in API cache (lib/api-cache.ts + useApi({ cacheMs })).
 * It holds financial figures, so the tests are about SAFETY first: tenant isolation, sign-out, staleness labelling, and
 * never serving a cached copy as if it were new.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { cacheKey, dedupe, invalidateApiCache, readCache, writeCache } from './api-cache';
import { clearSession } from './auth-fetch';
import { useApi } from './use-api';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const setUser = (id: string, orgId: string) => localStorage.setItem('spendguard_user', JSON.stringify({ id, orgId, name: 'x' }));

beforeEach(() => {
  localStorage.setItem('spendguard_token', 't');
  setUser('u1', 'org-a');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

describe('cache module', () => {
  it('returns what was written, with fresh/stale judged against the age limit', () => {
    writeCache('/api/x', { n: 1 }, Date.now() - 10_000);
    expect(readCache('/api/x', 60_000)).toMatchObject({ data: { n: 1 }, fresh: true });
    expect(readCache('/api/x', 5_000)).toMatchObject({ data: { n: 1 }, fresh: false });
    expect(readCache('/api/never', 60_000)).toBeNull();
  });

  it('TENANT ISOLATION: another user or organization on the same browser never sees these entries', () => {
    writeCache('/api/v1/insights/forecast?', { spend: 123 });
    expect(readCache('/api/v1/insights/forecast?', 60_000)?.data).toEqual({ spend: 123 });
    setUser('u2', 'org-b'); // someone else signs in on this tab without the cache being cleared
    expect(readCache('/api/v1/insights/forecast?', 60_000)).toBeNull();
    setUser('u3', 'org-a'); // another USER of the same organization is also a different key
    expect(readCache('/api/v1/insights/forecast?', 60_000)).toBeNull();
    expect(cacheKey('/a')).not.toBe((setUser('u1', 'org-a'), cacheKey('/a')));
  });

  it('is cleared when the session is cleared (sign-out, expired session)', () => {
    writeCache('/api/x', { n: 1 });
    clearSession();
    setUser('u1', 'org-a');
    expect(readCache('/api/x', 60_000)).toBeNull();
  });

  it('invalidation by prefix drops only the matching entries of the current user', () => {
    writeCache('/api/v1/insights/forecast', 1);
    writeCache('/api/v1/insights/attribution', 2);
    writeCache('/api/v1/projects', 3);
    invalidateApiCache('/api/v1/insights');
    expect(readCache('/api/v1/insights/forecast', 1e9)).toBeNull();
    expect(readCache('/api/v1/insights/attribution', 1e9)).toBeNull();
    expect(readCache('/api/v1/projects', 1e9)?.data).toBe(3);
    invalidateApiCache();
    expect(readCache('/api/v1/projects', 1e9)).toBeNull();
  });

  it('is bounded: the oldest entries are dropped', () => {
    for (let i = 0; i < 80; i++) writeCache(`/api/${i}`, i);
    expect(readCache('/api/0', 1e9)).toBeNull();
    expect(readCache('/api/79', 1e9)?.data).toBe(79);
  });

  it('concurrent identical requests share one network call', async () => {
    const load = vi.fn(async () => 'x');
    const [a, b, c] = await Promise.all([dedupe('/api/y', load), dedupe('/api/y', load), dedupe('/api/y', load)]);
    expect([a, b, c]).toEqual(['x', 'x', 'x']);
    expect(load).toHaveBeenCalledTimes(1);
    await dedupe('/api/y', load); // after it settled, a new call is a new request
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('never stores anything in browser storage', () => {
    const before = JSON.stringify({ ...localStorage });
    writeCache('/api/financial', { usd: 999 });
    expect(JSON.stringify({ ...localStorage })).toBe(before);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('999');
  });
});

function Probe({ url, cacheMs }: { url: string; cacheMs?: number }) {
  const { data, loading, isStale, fetchedAt, error, reload } = useApi<{ v: number }>(url, { cacheMs });
  return (
    <div>
      <span data-testid="v">{data ? data.v : 'none'}</span>
      <span data-testid="state">{error ? 'error' : loading ? 'loading' : 'ready'}</span>
      <span data-testid="stale">{String(isStale)}</span>
      <span data-testid="at">{fetchedAt ? 'has-time' : 'no-time'}</span>
      <button onClick={reload}>reload</button>
    </div>
  );
}

describe('useApi with cacheMs', () => {
  it('a revisit within the window shows the data at once and makes NO request', async () => {
    const f = vi.fn(async () => json({ v: 1 }));
    vi.stubGlobal('fetch', f);
    const first = render(<Probe url="/api/a" cacheMs={60_000} />);
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('1'));
    expect(f).toHaveBeenCalledTimes(1);
    first.unmount();
    render(<Probe url="/api/a" cacheMs={60_000} />);
    expect(screen.getByTestId('v')).toHaveTextContent('1'); // synchronous: no flash of a skeleton
    expect(screen.getByTestId('state')).toHaveTextContent('ready');
    expect(screen.getByTestId('stale')).toHaveTextContent('false');
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('after the window the cached copy is shown AS STALE while a fresh one loads, then replaced', async () => {
    let n = 0;
    const f = vi.fn(async () => json({ v: ++n }));
    vi.stubGlobal('fetch', f);
    writeCache('/api/b', { v: 0 }, Date.now() - 120_000);
    render(<Probe url="/api/b" cacheMs={60_000} />);
    expect(screen.getByTestId('v')).toHaveTextContent('0');
    expect(screen.getByTestId('stale')).toHaveTextContent('true'); // labelled, not passed off as current
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('1'));
    expect(screen.getByTestId('stale')).toHaveTextContent('false');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('reload() always goes to the network, even with a fresh cached copy', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => json({ v: ++n })));
    render(<Probe url="/api/c" cacheMs={60_000} />);
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('1'));
    await act(async () => screen.getByText('reload').click());
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('2'));
  });

  it('without cacheMs nothing changes: every mount fetches', async () => {
    const f = vi.fn(async () => json({ v: 1 }));
    vi.stubGlobal('fetch', f);
    const a = render(<Probe url="/api/d" />);
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('1'));
    a.unmount();
    render(<Probe url="/api/d" />);
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    expect(readCache('/api/d', 1e9)).toBeNull();
  });

  it('an error is shown as an error, and the last good data is kept rather than blanked', async () => {
    let fail = false;
    vi.stubGlobal('fetch', vi.fn(async () => (fail ? new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 }) : json({ v: 5 }))));
    render(<Probe url="/api/e" cacheMs={60_000} />);
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('5'));
    fail = true;
    await act(async () => screen.getByText('reload').click());
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('error'));
    expect(screen.getByTestId('v')).toHaveTextContent('5');
  });

  it("another organization's cached data is not shown when this one mounts", async () => {
    writeCache('/api/f', { v: 999 }); // written as org-a
    setUser('u9', 'org-z');
    vi.stubGlobal('fetch', vi.fn(async () => json({ v: 7 })));
    render(<Probe url="/api/f" cacheMs={60_000} />);
    expect(screen.getByTestId('v')).toHaveTextContent('none');
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('7'));
  });
});
