'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { StoredUser } from './types';

/**
 * React bindings for browser storage.
 *
 * Reading localStorage inside useEffect and copying it into state renders twice
 * and is flagged by the React compiler. useSyncExternalStore reads storage
 * during render instead: the server snapshot is `null` (no hydration mismatch)
 * and components re-render when storage changes in this tab or another one.
 */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Call after writing to storage so subscribed components re-read it. */
export function notifyStorageChange() {
  listeners.forEach((l) => l());
}

function safeGet(area: 'local' | 'session', key: string): string | null {
  try {
    return (area === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

export function useLocalStorageValue(key: string): string | null {
  return useSyncExternalStore(subscribe, () => safeGet('local', key), () => null);
}

export function useSessionStorageValue(key: string): string | null {
  return useSyncExternalStore(subscribe, () => safeGet('session', key), () => null);
}

/** `false` during server render and hydration, `true` once running in the browser. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** The signed-in user saved at login, or null. */
export function useStoredUser(): StoredUser | null {
  const raw = useLocalStorageValue('spendguard_user');
  return useMemo(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredUser;
    } catch {
      return null;
    }
  }, [raw]);
}

function subscribeToLocation(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}

/** A query-string parameter of the current URL (null on the server). */
export function useQueryParam(name: string): string | null {
  return useSyncExternalStore(
    subscribeToLocation,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}
