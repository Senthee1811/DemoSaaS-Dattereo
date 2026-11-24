/**
 * Deterministic spend-change analysis. Pure functions over ledger aggregates; every number a user is shown
 * comes from here, never from a model. Statements carry references (request ids / aggregate scope) so each
 * claim can be traced to ledger records.
 */

export interface Totals {
  requests: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface Bucket extends Totals {
  /** ISO start of the bucket (UTC) */
  start: string;
}

const round = (n: number, d = 6) => Number(n.toFixed(d));
const tokens = (t: Totals) => t.tokensIn + t.tokensOut;

/** Scale a baseline period to the length of the analysed window so the two are comparable. */
export function normalizeTotals(t: Totals, factor: number): Totals {
  return { requests: t.requests * factor, tokensIn: t.tokensIn * factor, tokensOut: t.tokensOut * factor, costUsd: t.costUsd * factor };
}

// ── 1. Why did spend change? Exact three-factor decomposition ───────────────
// spend = requests × tokens-per-request × price-per-token, so
//   Δspend = volume + tokens-per-request + price-per-token   (an exact telescoping identity, no residual)
//   volume             = (R1 − R0) · t0 · p0
//   tokens per request = R1 · (t1 − t0) · p0
//   price per token    = R1 · t1 · (p1 − p0)      (model mix and price changes)
export interface Decomposition {
  status: 'ok' | 'no_baseline';
  baselineSpendUsd: number;
  windowSpendUsd: number;
  deltaUsd: number;
  effects: { requestVolume: number; tokensPerRequest: number; pricePerToken: number } | null;
  dominant: 'requestVolume' | 'tokensPerRequest' | 'pricePerToken' | null;
  baseline: { requests: number; tokensPerRequest: number; usdPer1kTokens: number } | null;
  window: { requests: number; tokensPerRequest: number; usdPer1kTokens: number } | null;
  note?: string;
}

export function decompose(window: Totals, baselineNormalized: Totals): Decomposition {
  const R1 = window.requests;
  const R0 = baselineNormalized.requests;
  const tok0 = tokens(baselineNormalized);
  const tok1 = tokens(window);
  const base = { baselineSpendUsd: round(baselineNormalized.costUsd), windowSpendUsd: round(window.costUsd), deltaUsd: round(window.costUsd - baselineNormalized.costUsd) };
  if (R0 <= 0 || tok0 <= 0 || baselineNormalized.costUsd <= 0) {
    return { status: 'no_baseline', ...base, effects: null, dominant: null, baseline: null, window: null, note: 'There was no comparable spend before this window, so the change cannot be split into factors.' };
  }
  if (R1 <= 0 || tok1 <= 0) {
    return { status: 'no_baseline', ...base, effects: null, dominant: null, baseline: null, window: null, note: 'There was no spend in the window.' };
  }
  const t0 = tok0 / R0;
  const t1 = tok1 / R1;
  const p0 = baselineNormalized.costUsd / tok0;
  const p1 = window.costUsd / tok1;
  const effects = {
    requestVolume: round((R1 - R0) * t0 * p0),
    tokensPerRequest: round(R1 * (t1 - t0) * p0),
    pricePerToken: round(R1 * t1 * (p1 - p0)),
  };
  const dominant = (Object.entries(effects).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0][0]) as Decomposition['dominant'];
  return {
    status: 'ok',
    ...base,
    effects,
    dominant,
    baseline: { requests: round(R0, 2), tokensPerRequest: round(t0, 2), usdPer1kTokens: round(p0 * 1000, 6) },
    window: { requests: R1, tokensPerRequest: round(t1, 2), usdPer1kTokens: round(p1 * 1000, 6) },
  };
}

// ── 2. Who contributed? ─────────────────────────────────────────────────────
export interface MemberTotals extends Totals {
  /** null = not attributed (reported as such) */
  key: string | null;
  label: string;
}

export interface Contributor {
  key: string | null;
  label: string;
  windowCostUsd: number;
  baselineCostUsd: number;
  deltaUsd: number;
  /** Share of the TOTAL change; null when the total change is ~0. Can exceed 100% / be negative when others offset. */
  shareOfChange: number | null;
  isNew: boolean;
  windowRequests: number;
  baselineRequests: number;
  windowTokensPerRequest: number | null;
  baselineTokensPerRequest: number | null;
}

export function contributors(windowMembers: MemberTotals[], baselineMembers: MemberTotals[], scale: number, totalDelta: number): Contributor[] {
  const k = (m: { key: string | null }) => m.key ?? '\u0000unattributed';
  const base = new Map(baselineMembers.map((m) => [k(m), m]));
  const win = new Map(windowMembers.map((m) => [k(m), m]));
  const all = new Set([...base.keys(), ...win.keys()]);
  const out: Contributor[] = [];
  for (const id of all) {
    const w = win.get(id);
    const b = base.get(id);
    const bCost = (b?.costUsd ?? 0) * scale;
    const bReq = (b?.requests ?? 0) * scale;
    const wCost = w?.costUsd ?? 0;
    const delta = wCost - bCost;
    out.push({
      key: (w ?? b)!.key,
      label: (w ?? b)!.label,
      windowCostUsd: round(wCost),
      baselineCostUsd: round(bCost),
      deltaUsd: round(delta),
      shareOfChange: Math.abs(totalDelta) < 1e-9 ? null : round(delta / totalDelta, 4),
      isNew: !b && !!w,
      windowRequests: w?.requests ?? 0,
      baselineRequests: round(bReq, 2),
      windowTokensPerRequest: w && w.requests > 0 ? round(tokens(w) / w.requests, 2) : null,
      baselineTokensPerRequest: b && b.requests > 0 ? round(tokens(b) / b.requests, 2) : null,
    });
  }
  return out.sort((a, b) => Math.abs(b.deltaUsd) - Math.abs(a.deltaUsd));
}

// ── 3. When did it change? ──────────────────────────────────────────────────
export interface ChangePoint {
  startedAt: string;
  bucketCostUsd: number;
  baselineMeanUsd: number;
  baselineStdDevUsd: number;
  thresholdUsd: number;
}

/**
 * Fills a gap-free bucket grid (a bucket with no ledger rows really cost $0), then finds the first bucket at or after
 * `windowStartMs` whose cost exceeds baseline mean + 3σ AND at least twice the baseline mean AND `minUsd`.
 * Returns null when there is no discrete jump (e.g. a gradual climb) or the baseline is too thin to judge.
 */
export function findChangePoint(buckets: Bucket[], bucketMs: number, baselineStartMs: number, windowStartMs: number, windowEndMs: number, minUsd = 0.01): ChangePoint | null {
  const byStart = new Map(buckets.map((b) => [new Date(b.start).getTime(), b.costUsd]));
  // Buckets sit on the grid (hour/day boundaries) but the window usually does not start on one. The bucket that
  // CONTAINS the window start is partly baseline and partly window, so it is excluded from both: the baseline is the
  // complete buckets before it and the scan covers the complete buckets from the next boundary on.
  const firstWindowBucket = Math.ceil(windowStartMs / bucketMs) * bucketMs;
  const lastBaselineBucketEnd = Math.floor(windowStartMs / bucketMs) * bucketMs;
  const base: number[] = [];
  for (let t = baselineStartMs; t < lastBaselineBucketEnd; t += bucketMs) base.push(byStart.get(t) ?? 0);
  if (base.length < 6 || base.every((v) => v === 0)) return null;
  const mean = base.reduce((a, b) => a + b, 0) / base.length;
  const sd = Math.sqrt(base.reduce((a, b) => a + (b - mean) ** 2, 0) / (base.length - 1));
  const threshold = Math.max(mean + 3 * sd, mean * 2, minUsd);
  // (the last bucket may still be filling up; that can only under-detect, never invent a jump)
  for (let t = firstWindowBucket; t < windowEndMs; t += bucketMs) {
    const c = byStart.get(t) ?? 0;
    if (c > threshold) {
      return { startedAt: new Date(t).toISOString(), bucketCostUsd: round(c), baselineMeanUsd: round(mean), baselineStdDevUsd: round(sd), thresholdUsd: round(threshold) };
    }
  }
  return null;
}

// ── 4. How does it compare with history? ────────────────────────────────────
export interface HistoricalContext {
  baselineDays: number;
  /** The window's spend expressed per 24h, compared with the baseline's daily totals */
  windowSpendPerDayUsd: number;
  medianDayUsd: number;
  p90DayUsd: number;
  maxDayUsd: number;
  /** Share of baseline days that cost LESS than the window's per-day rate (0..1) */
  percentileRank: number;
  multipleOfMedian: number | null;
}

export function historicalContext(windowSpendPerDay: number, baselineDailyCosts: number[]): HistoricalContext | null {
  if (baselineDailyCosts.length < 3) return null;
  const sorted = [...baselineDailyCosts].sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  const median = q(0.5);
  return {
    baselineDays: sorted.length,
    windowSpendPerDayUsd: round(windowSpendPerDay),
    medianDayUsd: round(median),
    p90DayUsd: round(q(0.9)),
    maxDayUsd: round(sorted[sorted.length - 1]),
    percentileRank: round(sorted.filter((v) => v < windowSpendPerDay).length / sorted.length, 4),
    multipleOfMedian: median > 0 ? round(windowSpendPerDay / median, 2) : null,
  };
}

/** How much baseline there is to compare against. */
export function baselineSufficiency(daysWithSpend: number): 'insufficient' | 'low' | 'medium' | 'high' {
  // Counts COMPLETE days with spend. A 7-day baseline that does not start at midnight has 6 complete days.
  if (daysWithSpend < 3) return 'insufficient';
  if (daysWithSpend < 5) return 'low';
  if (daysWithSpend < 6) return 'medium';
  return 'high';
}

export const INVESTIGATION_METHOD =
  'Compares the selected window with the preceding baseline period of the same ledger, scaled to the same length. ' +
  'The change in spend is split exactly into request volume, tokens per request and price per token (volume + tokens/request + price/token = total change). ' +
  'Contributors are ranked by their own change in spend. A change point is the first hour/day above baseline mean + 3σ and 2× the mean.';
