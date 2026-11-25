'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { dedupe, readCache, writeCache } from '@/lib/api-cache';
import { errorMessage } from '@/lib/types';

export interface UseApiOptions {
  /**
   * Opt in to the in-memory cache (see lib/api-cache.ts). Within this many ms of the last fetch the cached data is shown and NO
   * request is made; after it, the cached data is shown as stale (`isStale`) while a fresh copy loads. Default: no caching.
   */
  cacheMs?: number;
}

/**
 * GET a JSON endpoint with the session token. Keeps the last good data while a reload is in
 * flight (no flash back to a spinner) and surfaces the real server error message on failure.
 * State is only set after the response arrives, never synchronously inside the effect.
 *
 *  - `fetchedAt`: when the data on screen was fetched (ms since epoch), so callers can say how old it is
 *  - `isStale`: the data on screen came from the cache and is older than `cacheMs`; a refresh is in progress
 *  - `reload()`: always goes to the network (it bypasses the cache)
 */
export function useApi<T>(url: string, options: UseApiOptions = {}) {
  const { cacheMs = 0 } = options;
  const [reloadCount, setReloadCount] = useState(0);
  const key = `${url}#${reloadCount}`;
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null; at: number } | null>(null);

  // Reading the cache during render is deliberate: it is what lets a revisit paint immediately. It is a plain Map lookup.
  const cached = cacheMs > 0 && reloadCount === 0 ? readCache<T>(url, cacheMs) : null;
  const cachedFresh = cached?.fresh === true;

  useEffect(() => {
    if (cachedFresh) return; // fresh enough: no request
    let cancelled = false;
    const controller = new AbortController();
    const load = async (): Promise<T> => {
      const res = await authFetch(url, cacheMs > 0 ? undefined : { signal: controller.signal });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not load this section.'));
      return (await res.json()) as T;
    };
    (cacheMs > 0 ? dedupe(url, load) : load())
      .then((data) => {
        if (cacheMs > 0) writeCache(url, data);
        if (!cancelled) setResult({ key, data, error: null, at: Date.now() });
      })
      .catch((err) => !cancelled && setResult((prev) => ({ key, data: prev?.data ?? null, error: errorMessage(err, 'Could not load this section.'), at: prev?.at ?? 0 })));
    return () => {
      cancelled = true;
      controller.abort();
    };
    // `cachedFresh` is derived from the cache on every render; the request must only re-run when the target changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key, cacheMs]);

  const reload = useCallback(() => setReloadCount((n) => n + 1), []);
  const own = result && result.key === key ? result : null;
  const shown = own?.data ?? (cached ? cached.data : result?.data ?? null);
  const fetchedAt = own ? own.at : cached ? cached.at : result?.at ?? null;
  return {
    data: shown,
    error: own?.error ?? null,
    loading: !own && !cachedFresh,
    reload,
    fetchedAt,
    isStale: !own && cached !== null && !cachedFresh,
  };
}
