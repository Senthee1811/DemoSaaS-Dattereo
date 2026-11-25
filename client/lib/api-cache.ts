/**
 * A small in-memory cache for GET responses, used only by call sites that opt in (`useApi(url, { cacheMs })`).
 *
 * Why it exists: leaving a Cost Insights tab and coming back used to refetch and re-render from scratch. With this, a revisit
 * within `cacheMs` shows the data immediately and makes no request; after that the data is shown AS STALE, labelled with when
 * it was fetched, while a fresh copy loads. Nothing is ever shown as current that was not fetched recently.
 *
 * Safety rules (this holds financial figures):
 *  - memory only: nothing is written to localStorage/sessionStorage/IndexedDB, so it cannot outlive the tab
 *  - the key includes the signed-in user and organization, so one tenant's data can never be returned for another's
 *  - the whole cache is cleared on sign-out / session loss (see clearSession) and on any explicit invalidation
 *  - concurrent identical requests share one network call
 *  - bounded size (oldest entries are dropped)
 */
const MAX_ENTRIES = 60;

interface Entry {
  data: unknown;
  at: number;
}

const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function identity(): string {
  try {
    const raw = window.localStorage.getItem('spendguard_user');
    if (!raw) return 'anonymous';
    const u = JSON.parse(raw) as { id?: string; orgId?: string };
    return `${u.orgId ?? '?'}:${u.id ?? '?'}`;
  } catch {
    return 'anonymous';
  }
}

export const cacheKey = (url: string) => `${identity()}|${url}`;

/**
 * The cached copy of `url`, with `fresh` = it was fetched less than `maxAgeMs` ago. Whether an entry is fresh depends on the
 * clock, so that judgement lives here (not in a React render, which must be pure).
 */
export function readCache<T>(url: string, maxAgeMs: number): { data: T; at: number; fresh: boolean } | null {
  const e = entries.get(cacheKey(url));
  return e ? { data: e.data as T, at: e.at, fresh: Date.now() - e.at < maxAgeMs } : null;
}

export function writeCache(url: string, data: unknown, at = Date.now()) {
  const k = cacheKey(url);
  entries.delete(k);
  entries.set(k, { data, at });
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
}

/** Runs `load` unless an identical request is already in flight; concurrent callers share the result. */
export function dedupe<T>(url: string, load: () => Promise<T>): Promise<T> {
  const k = cacheKey(url);
  const existing = inflight.get(k);
  if (existing) return existing as Promise<T>;
  const p = load().finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

/** Drops cached entries whose URL starts with `prefix` (all of this user's entries when omitted). Call after a mutation. */
export function invalidateApiCache(prefix?: string) {
  const id = `${identity()}|`;
  for (const k of [...entries.keys()]) if (k.startsWith(id) && (!prefix || k.slice(id.length).startsWith(prefix))) entries.delete(k);
}

/** Drops everything, for every user. Called when the session ends. */
export function clearApiCache() {
  entries.clear();
  inflight.clear();
}
