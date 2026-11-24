import { baselineSufficiency, Bucket, contributors, decompose, findChangePoint, historicalContext, MemberTotals, normalizeTotals, Totals } from '../src/modules/insights/calc/investigation.calc';

const T = (requests: number, tokensIn: number, tokensOut: number, costUsd: number): Totals => ({ requests, tokensIn, tokensOut, costUsd });

describe('decomposition: spend = requests × tokens/request × price/token (exact, no residual)', () => {
  // Baseline: 100 requests × 1,000 tokens at $0.001 per 1K tokens = $100
  const base = T(100, 600_000, 400_000 - 300_000, 70); // 100 requests, 700k tokens → $70 (tokens/req 7000? keep simple below)
  void base;
  const b = T(100, 60_000, 40_000, 10); // 100 req, 1,000 tokens/req, $0.0001/token → $10

  it('request volume only: doubling requests at the same size and price', () => {
    const w = T(200, 120_000, 80_000, 20);
    const d = decompose(w, b);
    expect(d.status).toBe('ok');
    expect(d.effects).toEqual({ requestVolume: 10, tokensPerRequest: 0, pricePerToken: 0 });
    expect(d.dominant).toBe('requestVolume');
    expect(d.deltaUsd).toBe(10);
  });

  it('tokens per request only: same number of requests, each 3× longer, same price per token', () => {
    const w = T(100, 180_000, 120_000, 30);
    const d = decompose(w, b);
    expect(d.effects!.requestVolume).toBe(0);
    expect(d.effects!.tokensPerRequest).toBeCloseTo(20, 9);
    expect(d.effects!.pricePerToken).toBeCloseTo(0, 9);
    expect(d.dominant).toBe('tokensPerRequest');
    expect(d.window!.tokensPerRequest).toBe(3000);
    expect(d.baseline!.tokensPerRequest).toBe(1000);
  });

  it('price per token only: same traffic moved to a model that costs 5× more', () => {
    const w = T(100, 60_000, 40_000, 50);
    const d = decompose(w, b);
    expect(d.effects!.requestVolume).toBe(0);
    expect(d.effects!.tokensPerRequest).toBeCloseTo(0, 9);
    expect(d.effects!.pricePerToken).toBeCloseTo(40, 9);
    expect(d.dominant).toBe('pricePerToken');
  });

  it('combined change: the three effects add up EXACTLY to the total change', () => {
    const w = T(250, 400_000, 100_000, 90);
    const d = decompose(w, b);
    const sum = d.effects!.requestVolume + d.effects!.tokensPerRequest + d.effects!.pricePerToken;
    expect(sum).toBeCloseTo(d.deltaUsd, 5);
    expect(d.deltaUsd).toBe(80);
  });

  it('PROPERTY: for 500 pseudo-random scenarios the effects always sum to the change (no residual)', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let i = 0; i < 500; i++) {
      const base = T(1 + Math.floor(rnd() * 5000), 1000 + Math.floor(rnd() * 5e6), 1000 + Math.floor(rnd() * 5e6), 0.01 + rnd() * 500);
      const win = T(1 + Math.floor(rnd() * 5000), 1000 + Math.floor(rnd() * 5e6), 1000 + Math.floor(rnd() * 5e6), 0.01 + rnd() * 500);
      const d = decompose(win, base);
      const sum = d.effects!.requestVolume + d.effects!.tokensPerRequest + d.effects!.pricePerToken;
      expect(Math.abs(sum - (win.costUsd - base.costUsd))).toBeLessThan(1e-4);
    }
  });

  it('a decrease gives negative effects (savings are explained too)', () => {
    const d = decompose(T(50, 30_000, 20_000, 5), b);
    expect(d.deltaUsd).toBe(-5);
    expect(d.effects!.requestVolume).toBe(-5);
  });

  it('no baseline spend → it refuses to split the change instead of dividing by zero', () => {
    const d = decompose(T(10, 5000, 5000, 3), T(0, 0, 0, 0));
    expect(d.status).toBe('no_baseline');
    expect(d.effects).toBeNull();
    expect(d.note).toMatch(/no comparable spend/);
    expect(d.deltaUsd).toBe(3);
  });

  it('no spend in the window → no split', () => {
    expect(decompose(T(0, 0, 0, 0), b).status).toBe('no_baseline');
  });

  it('a baseline of different length is scaled to the window first (7 days of baseline vs a 1-day window)', () => {
    const baseline7d = T(700, 420_000, 280_000, 70); // $10/day
    const scaled = normalizeTotals(baseline7d, 1 / 7);
    expect(scaled.costUsd).toBeCloseTo(10, 9);
    expect(scaled.requests).toBeCloseTo(100, 9);
    const d = decompose(T(300, 180_000, 120_000, 30), scaled);
    expect(d.baselineSpendUsd).toBe(10);
    expect(d.deltaUsd).toBe(20);
  });
});

describe('contributors', () => {
  const m = (key: string | null, requests: number, tokens: number, costUsd: number, label = key ?? 'Unattributed'): MemberTotals => ({ key, label, requests, tokensIn: tokens, tokensOut: 0, costUsd });

  it('ranks by the size of each member\'s own change and reports the share of the total change', () => {
    const win = [m('gpt-4o', 100, 100_000, 60), m('claude', 100, 100_000, 25), m('mini', 100, 100_000, 5)];
    const base = [m('gpt-4o', 100, 100_000, 10), m('claude', 100, 100_000, 20), m('mini', 100, 100_000, 5)];
    const c = contributors(win, base, 1, 55);
    expect(c.map((x) => x.key)).toEqual(['gpt-4o', 'claude', 'mini']);
    expect(c[0]).toMatchObject({ deltaUsd: 50, shareOfChange: 0.9091, isNew: false });
    expect(c[1]).toMatchObject({ deltaUsd: 5 });
    expect(c[2].deltaUsd).toBe(0);
  });

  it('flags members that did not exist in the baseline (new key / new model)', () => {
    const c = contributors([m('new-model', 10, 10_000, 40)], [], 1, 40);
    expect(c[0]).toMatchObject({ isNew: true, baselineCostUsd: 0, deltaUsd: 40, shareOfChange: 1 });
  });

  it('a member that disappeared contributes a negative change', () => {
    const c = contributors([], [m('old', 10, 10_000, 30)], 1, -30);
    expect(c[0]).toMatchObject({ deltaUsd: -30, windowCostUsd: 0, isNew: false });
  });

  it('scales the baseline to the window length', () => {
    const c = contributors([m('a', 10, 1000, 20)], [m('a', 70, 7000, 70)], 1 / 7, 10);
    expect(c[0].baselineCostUsd).toBe(10);
    expect(c[0].baselineRequests).toBe(10);
    expect(c[0].deltaUsd).toBe(10);
  });

  it('unattributed spend is its own member and is never merged into a named one', () => {
    const c = contributors([m(null, 10, 1000, 8), m('support-bot', 10, 1000, 2)], [], 1, 10);
    expect(c.find((x) => x.key === null)!.label).toBe('Unattributed');
    expect(c).toHaveLength(2);
  });

  it('share of change is null when the total change is ~0 (no division by zero)', () => {
    const c = contributors([m('a', 1, 1, 5)], [m('a', 1, 1, 5)], 1, 0);
    expect(c[0].shareOfChange).toBeNull();
  });
});

describe('change point: when did it change?', () => {
  const HOUR = 3_600_000;
  const t0 = Date.parse('2026-11-20T00:00:00Z');
  const series = (costs: number[]): Bucket[] => costs.map((c, i) => ({ start: new Date(t0 + i * HOUR).toISOString(), requests: 1, tokensIn: 0, tokensOut: 0, costUsd: c }));
  // 48 baseline hours around $1 (small variation), then a window of 24 hours
  const quiet = Array.from({ length: 48 }, (_, i) => 1 + (i % 3) * 0.1);

  it('finds the first hour above baseline mean + 3σ and 2× the mean', () => {
    const costs = [...quiet, 1, 1.1, 1, 9, 9, 9, ...Array(18).fill(9)];
    const cp = findChangePoint(series(costs), HOUR, t0, t0 + 48 * HOUR, t0 + 72 * HOUR)!;
    expect(cp.startedAt).toBe(new Date(t0 + 51 * HOUR).toISOString());
    expect(cp.bucketCostUsd).toBe(9);
    expect(cp.baselineMeanUsd).toBeCloseTo(1.1, 1);
    expect(cp.thresholdUsd).toBeGreaterThan(cp.baselineMeanUsd * 2 - 0.001);
  });

  it('works when the window does NOT start on a bucket boundary (the normal case: "the last 24 hours")', () => {
    // window starts 20 minutes past the hour; the straddling hour is neither baseline nor window
    const windowStart = t0 + 48 * HOUR + 20 * 60_000;
    const costs = [...quiet, 1, 1.1, 1, 9, 9, 9, ...Array(18).fill(9)];
    const cp = findChangePoint(series(costs), HOUR, t0, windowStart, windowStart + 24 * HOUR)!;
    expect(cp).not.toBeNull();
    expect(cp.startedAt).toBe(new Date(t0 + 51 * HOUR).toISOString());
    // the baseline statistics only use complete buckets before the straddling hour
    expect(cp.baselineMeanUsd).toBeCloseTo(1.1, 1);
  });

  it('a jump inside the straddling first hour is not mistaken for a baseline hour', () => {
    const windowStart = t0 + 48 * HOUR + 20 * 60_000;
    const costs = [...quiet, 9, 1, 1, 1, ...Array(20).fill(1)]; // the spike is in hour 48, which straddles the window start
    expect(findChangePoint(series(costs), HOUR, t0, windowStart, windowStart + 24 * HOUR)).toBeNull();
  });

  it('a gradual climb that never doubles the baseline has no change point', () => {
    const costs = [...quiet, ...Array.from({ length: 24 }, (_, i) => 1.1 + i * 0.03)]; // peaks at ~1.8 < 2× the 1.1 mean
    expect(findChangePoint(series(costs), HOUR, t0, t0 + 48 * HOUR, t0 + 72 * HOUR)).toBeNull();
  });

  it('…but a climb that does exceed 2× the baseline and 3σ is reported at the first hour that crosses it', () => {
    const costs = [...quiet, ...Array.from({ length: 24 }, (_, i) => 1.1 + i * 0.05)]; // reaches 2.25 in the last hour
    const cp = findChangePoint(series(costs), HOUR, t0, t0 + 48 * HOUR, t0 + 72 * HOUR)!;
    expect(cp.startedAt).toBe(new Date(t0 + 71 * HOUR).toISOString());
  });

  it('missing hours count as $0 (a quiet hour really cost nothing), so a late-night start is still a jump', () => {
    const sparse = series([...quiet, ...Array(5).fill(0), 20]).filter((b) => b.costUsd > 0); // zero hours absent from the series
    const cp = findChangePoint(sparse, HOUR, t0, t0 + 48 * HOUR, t0 + 72 * HOUR)!;
    expect(cp.startedAt).toBe(new Date(t0 + 53 * HOUR).toISOString());
  });

  it('refuses to judge with a baseline that is too short or empty', () => {
    expect(findChangePoint(series([1, 1, 1, 50]), HOUR, t0, t0 + 3 * HOUR, t0 + 4 * HOUR)).toBeNull();
    expect(findChangePoint(series(Array(60).fill(0)), HOUR, t0, t0 + 48 * HOUR, t0 + 60 * HOUR)).toBeNull();
  });

  it('ignores tiny absolute amounts even when the ratio is huge', () => {
    const costs = [...Array(48).fill(0.0001), 0.004, ...Array(23).fill(0.0001)];
    expect(findChangePoint(series(costs), HOUR, t0, t0 + 48 * HOUR, t0 + 72 * HOUR)).toBeNull();
  });
});

describe('historical context: how does this compare with previous days?', () => {
  it('percentile rank, median multiple and the highest earlier day', () => {
    const h = historicalContext(50, [8, 9, 10, 10, 11, 12, 30])!;
    expect(h.baselineDays).toBe(7);
    expect(h.medianDayUsd).toBe(10);
    expect(h.maxDayUsd).toBe(30);
    expect(h.percentileRank).toBe(1); // above every earlier day
    expect(h.multipleOfMedian).toBe(5);
    expect(historicalContext(10.5, [8, 9, 10, 10, 11, 12, 30])!.percentileRank).toBeCloseTo(4 / 7, 3);
  });

  it('needs at least 3 baseline days', () => {
    expect(historicalContext(10, [5, 6])).toBeNull();
  });

  it('a median of zero gives no multiple (never Infinity)', () => {
    expect(historicalContext(10, [0, 0, 0, 0, 5])!.multipleOfMedian).toBeNull();
  });

  it.each([[0, 'insufficient'], [2, 'insufficient'], [3, 'low'], [4, 'low'], [5, 'medium'], [6, 'high'], [7, 'high']])('baseline with spend on %i days → %s', (n, level) => {
    expect(baselineSufficiency(n)).toBe(level);
  });
});
