'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { errorMessage } from '@/lib/types';

/**
 * GET a JSON endpoint with the session token. Keeps the last good data while a reload is in
 * flight (no flash back to a spinner) and surfaces the real server error message on failure.
 * State is only set after the response arrives, never synchronously inside the effect.
 */
export function useApi<T>(url: string) {
  const [reloadCount, setReloadCount] = useState(0);
  const key = `${url}#${reloadCount}`;
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res, 'Could not load this section.'));
        return (await res.json()) as T;
      })
      .then((data) => !cancelled && setResult({ key, data, error: null }))
      .catch((err) => !cancelled && setResult((prev) => ({ key, data: prev?.data ?? null, error: errorMessage(err, 'Could not load this section.') })));
    return () => {
      cancelled = true;
    };
  }, [url, key]);

  const reload = useCallback(() => setReloadCount((n) => n + 1), []);
  return {
    data: result?.data ?? null,
    error: result && result.key === key ? result.error : null,
    loading: result?.key !== key,
    reload,
  };
}
