/**
 * Provider model-availability checks for the `model_pricing` table.
 *
 * What this does NOT do: fetch prices. None of OpenAI, Anthropic or Google exposes a
 * price API, so prices stay a maintained table (see PRICING_CATALOG). What the providers
 * DO expose is a list of the model IDs an API key can use; we compare the table against it
 * and FLAG rows the provider no longer lists. Nothing is deleted or deactivated here: a
 * human decides, so a provider outage or a permissions quirk can never silently remove
 * a model customers rely on.
 *
 * Endpoints (verified against the providers' docs on 2026-11-20):
 *  - OpenAI    GET https://api.openai.com/v1/models            -> { data: [{ id, shutdown_date? }] }
 *  - Anthropic GET https://api.anthropic.com/v1/models         -> { data: [{ id, retires_at, lifecycle }], has_more, last_id }
 *  - Gemini    GET https://generativelanguage.googleapis.com/v1beta/models -> { models: [{ name: 'models/<id>' }], nextPageToken }
 *  - Groq      GET https://api.groq.com/openai/v1/models       -> { data: [{ id, active? }] } (OpenAI-compatible)
 *
 * Plain relative imports only: the ops script runs this outside Nest's path mapping.
 */

export type ProviderName = 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | 'GROQ';
export const PROVIDERS: ProviderName[] = ['OPENAI', 'ANTHROPIC', 'GEMINI', 'GROQ'];

export interface ProviderModelInfo {
  id: string;
  retiresAt?: Date | null;
}

export interface ProviderSyncResult {
  provider: ProviderName;
  status: 'ok' | 'skipped' | 'error';
  reason?: string;
  checked: number;
  /** Catalog models the provider no longer lists. Flagged, never auto-removed. */
  missing: string[];
  /** Models the provider reports as retiring (OpenAI shutdown_date / Anthropic retires_at). */
  retiring: { model: string; retiresAt: string }[];
}

export type FetchLike = (
  url: string,
  init?: any,
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<any>;
  text(): Promise<string>;
}>;

const MAX_PAGES = 20;

/** Dedicated read-only keys; deliberately not the tenant/gateway provider keys. */
export function catalogKeyFor(
  provider: ProviderName,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const v = env[`MODEL_CATALOG_${provider}_API_KEY`];
  return v && v.trim() ? v.trim() : undefined;
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function getJson(fetchImpl: FetchLike, url: string, headers: Record<string, string>) {
  const res = await fetchImpl(url, { headers });
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`HTTP ${res.status} from ${new URL(url).host}: ${body}`);
  }
  return res.json();
}

export async function fetchProviderModels(
  provider: ProviderName,
  apiKey: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<ProviderModelInfo[]> {
  const out: ProviderModelInfo[] = [];

  if (provider === 'OPENAI') {
    const data = await getJson(fetchImpl, 'https://api.openai.com/v1/models', {
      Authorization: `Bearer ${apiKey}`,
    });
    for (const m of data?.data ?? []) {
      if (m?.id) out.push({ id: String(m.id), retiresAt: parseDate(m.shutdown_date) });
    }
    return out;
  }

  if (provider === 'GROQ') {
    const data = await getJson(fetchImpl, 'https://api.groq.com/openai/v1/models', {
      Authorization: `Bearer ${apiKey}`,
    });
    for (const m of data?.data ?? []) {
      // Groq marks models it has switched off with active: false. Those are not usable.
      if (m?.id && m.active !== false) out.push({ id: String(m.id) });
    }
    return out;
  }

  if (provider === 'ANTHROPIC') {
    let afterId: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({ limit: '1000' });
      if (afterId) qs.set('after_id', afterId);
      const data = await getJson(fetchImpl, `https://api.anthropic.com/v1/models?${qs}`, {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      });
      for (const m of data?.data ?? []) {
        if (m?.id) out.push({ id: String(m.id), retiresAt: parseDate(m.retires_at) });
      }
      if (!data?.has_more || !data?.last_id) break;
      afterId = data.last_id;
    }
    return out;
  }

  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) qs.set('pageToken', pageToken);
    const data = await getJson(
      fetchImpl,
      `https://generativelanguage.googleapis.com/v1beta/models?${qs}`,
      { 'x-goog-api-key': apiKey },
    );
    for (const m of data?.models ?? []) {
      if (m?.name) out.push({ id: String(m.name).replace(/^models\//, '') });
    }
    if (!data?.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return out;
}

/** Minimal Prisma surface used here, so tests can pass a fake. */
export interface CatalogDb {
  modelPricing: {
    findMany(args: any): Promise<any[]>;
    update(args: any): Promise<any>;
  };
}

/**
 * Compares active `model_pricing` rows against what each provider lists and records the
 * outcome on the rows (providerStatus / providerCheckedAt / retiresAt). A provider whose
 * check fails or has no key configured is left untouched.
 */
export async function syncModelCatalog(
  db: CatalogDb,
  opts: { env?: NodeJS.ProcessEnv; fetchImpl?: FetchLike; now?: Date } = {},
): Promise<ProviderSyncResult[]> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const results: ProviderSyncResult[] = [];

  for (const provider of PROVIDERS) {
    const base: ProviderSyncResult = { provider, status: 'ok', checked: 0, missing: [], retiring: [] };
    const key = catalogKeyFor(provider, env);
    if (!key) {
      results.push({ ...base, status: 'skipped', reason: `MODEL_CATALOG_${provider}_API_KEY not set` });
      continue;
    }

    let listed: ProviderModelInfo[];
    try {
      listed = await fetchProviderModels(provider, key, opts.fetchImpl);
    } catch (err: any) {
      results.push({ ...base, status: 'error', reason: err.message });
      continue;
    }
    // An empty list from a successful call is far more likely a permissions problem than
    // "every model was retired", so don't flag the whole table off it.
    if (listed.length === 0) {
      results.push({ ...base, status: 'error', reason: 'provider returned an empty model list' });
      continue;
    }

    const byId = new Map(listed.map((m) => [m.id, m]));
    const rows = await db.modelPricing.findMany({ where: { provider, isActive: true } });
    for (const row of rows) {
      const info = byId.get(row.model);
      await db.modelPricing.update({
        where: { id: row.id },
        data: {
          providerStatus: info ? 'available' : 'missing',
          providerCheckedAt: now,
          retiresAt: info?.retiresAt ?? null,
        },
      });
      if (!info) base.missing.push(row.model);
      else if (info.retiresAt) {
        base.retiring.push({ model: row.model, retiresAt: info.retiresAt.toISOString() });
      }
    }
    base.checked = rows.length;
    results.push(base);
  }
  return results;
}

export function formatSyncReport(results: ProviderSyncResult[]): string {
  const lines: string[] = [];
  for (const r of results) {
    if (r.status !== 'ok') {
      lines.push(`${r.provider}: ${r.status.toUpperCase()} (${r.reason})`);
      continue;
    }
    lines.push(`${r.provider}: checked ${r.checked} model(s), ${r.missing.length} missing`);
    for (const m of r.missing) {
      lines.push(`  ! ${m}  (no longer listed by provider; review and deactivate if retired)`);
    }
    for (const m of r.retiring) {
      lines.push(`  ~ ${m.model}  (provider reports retirement ${m.retiresAt.slice(0, 10)})`);
    }
  }
  return lines.join('\n');
}
