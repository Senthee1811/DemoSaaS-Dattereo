import 'reflect-metadata';
import { budgetRiskRule, highTokenApplicationRule, modelConcentrationRule, modelEvaluationRule, spendIncreaseRule, THRESHOLDS } from '../src/modules/insights/calc/recommendation.rules';
import { decompose, historicalContext, Totals } from '../src/modules/insights/calc/investigation.calc';
import { computeForecast } from '../src/modules/insights/calc/forecast.calc';
import { compareGroupToCandidate, UsageGroup } from '../src/modules/insights/calc/comparison.calc';
import { PRICING_CATALOG } from '../src/modules/pricing/pricing.catalog';

const T = (requests: number, tokens: number, costUsd: number): Totals => ({ requests, tokensIn: tokens * 0.7, tokensOut: tokens * 0.3, costUsd });

/** Every recommendation must carry these, whatever the rule. */
const complete = (r: any) => {
  expect(r.evidence).toBeTruthy();
  expect(typeof r.method).toBe('string');
  expect(r.method.length).toBeGreaterThan(40);
  expect(['low', 'medium', 'high']).toContain(r.confidence);
  expect(typeof r.action).toBe('string');
  expect(typeof r.requiresApproval).toBe('boolean');
  expect(r.fingerprint).toMatch(/^[A-Z_]+:/);
};

describe('SPEND_INCREASE', () => {
  const run = (windowCost: number, baselineCost: number, dailyBaseline: number[], windowDays = 7, sufficiency: any = 'high') => {
    const d = decompose(T(700, 700_000, windowCost), T(700, 700_000, baselineCost));
    const h = historicalContext(windowCost / windowDays, dailyBaseline);
    return spendIncreaseRule({ projectId: 'p1', projectName: 'Support', windowDays, decomposition: d, historical: h, baselineSufficiency: sufficiency, topContributors: [{ dimension: 'model', label: 'gpt-4o', deltaUsd: 30 }], evidenceRequestIds: ['req_a', 'req_b'] });
  };
  const calm = [9, 10, 11, 10, 9, 10, 11, 10, 9, 10];

  it('fires for a clear, unusual increase and cites its numbers, contributors and ledger request ids', () => {
    const r = run(280, 70, calm)!; // $40/day vs $10/day
    complete(r);
    expect(r.type).toBe('SPEND_INCREASE');
    expect(r.title).toMatch(/4\.0×/);
    expect(r.impactLowUsd).toBe(210);
    expect(r.impactHighUsd).toBe(210);
    expect(r.impactBasis).toMatch(/observed excess/);
    expect((r.evidence as any).ledgerRequestIds).toEqual(['req_a', 'req_b']);
    expect((r.evidence as any).topContributors[0]).toMatchObject({ dimension: 'model', label: 'gpt-4o' });
    expect(r.severity).toBe('critical'); // ≥ 3×
    expect(r.requiresApproval).toBe(false);
  });

  it('is only a warning between 1.5× and 3×', () => {
    expect(run(140, 70, calm)!.severity).toBe('warning'); // 2×, $20/day: unusual versus a $10 median
  });

  it.each([
    ['below the ratio threshold (1.3×)', () => run(91, 70, calm)],
    ['a tiny absolute change (under $1)', () => run(0.9, 0.2, [0.1, 0.1, 0.1, 0.1])],
    ['within normal historical variation', () => run(105, 70, [5, 20, 8, 25, 6, 22, 10, 24])],
    ['no baseline to compare against', () => run(100, 0, calm)],
    ['an insufficient baseline', () => run(280, 70, calm, 7, 'insufficient')],
  ])('does NOT fire for %s', (_n, fn) => {
    expect(fn()).toBeNull();
  });

  it('confidence follows how much baseline there is, and is never higher', () => {
    expect(run(280, 70, calm, 7, 'high')!.confidence).toBe('high');
    expect(run(280, 70, calm, 7, 'medium')!.confidence).toBe('medium');
    expect(run(280, 70, calm, 7, 'low')!.confidence).toBe('low');
  });

  it('is one finding per project (stable fingerprint) so regeneration updates instead of duplicating', () => {
    expect(run(280, 70, calm)!.fingerprint).toBe('SPEND_INCREASE:p1');
  });
});

describe('MODEL_CONCENTRATION', () => {
  const run = (models: Array<{ model: string; spendUsd: number; requests: number }>) => modelConcentrationRule({ projectId: 'p1', projectName: 'Support', days: 30, models });

  it('fires when one of several models holds ≥ 60% of meaningful spend', () => {
    const r = run([{ model: 'gpt-4o', spendUsd: 80, requests: 4000 }, { model: 'gpt-4o-mini', spendUsd: 20, requests: 9000 }])!;
    complete(r);
    expect(r.title).toMatch(/gpt-4o is 80%/);
    expect(r.severity).toBe('info');
    expect(r.impactLowUsd).toBeNull(); // informational: no money claim
    expect(r.confidence).toBe('high');
    expect((r.evidence as any).models[0]).toMatchObject({ model: 'gpt-4o', share: 0.8 });
  });
  it.each([
    ['an even split', [{ model: 'a', spendUsd: 50, requests: 1 }, { model: 'b', spendUsd: 50, requests: 1 }]],
    ['a single model (100% share is not a finding)', [{ model: 'a', spendUsd: 500, requests: 1 }]],
    ['trivial spend', [{ model: 'a', spendUsd: 3, requests: 1 }, { model: 'b', spendUsd: 0.5, requests: 1 }]],
  ])('does NOT fire for %s', (_n, models) => {
    expect(run(models as any)).toBeNull();
  });
});

describe('BUDGET_RISK', () => {
  const NOW = new Date('2026-11-15T12:00:00Z');
  const daily = (vals: number[]) => vals.map((v, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, spendUsd: v }));
  const fc = (budgetUsd: number, vals = Array(14).fill(10) as number[]) => computeForecast({ now: NOW, daily: [...daily(vals), { date: '2026-11-15', spendUsd: 4 }], firstActivityDate: '2026-11-01', budgetUsd });

  it('likely_exceed → critical, with the projected overage as the impact (a forecast, labelled)', () => {
    const r = budgetRiskRule({ projectId: 'p1', projectName: 'Support', forecast: fc(250) })!;
    complete(r);
    expect(r.severity).toBe('critical');
    expect(r.impactLowUsd).toBe(50); // 300 projected − 250 (low = high = 300 with steady spend)
    expect(r.impactBasis).toMatch(/forecast, not actual/);
    expect(r.confidence).toBe('high');
    expect(r.fingerprint).toBe('BUDGET_RISK:p1:2026-11');
  });
  it('at_risk → warning', () => {
    const vals = Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? 5 : 15));
    const r = budgetRiskRule({ projectId: 'p1', projectName: 'Support', forecast: computeForecast({ now: NOW, daily: [...daily(vals), { date: '2026-11-15', spendUsd: 10 }], firstActivityDate: '2026-11-01', budgetUsd: 310 }) })!;
    expect(r.severity).toBe('warning');
    expect(r.impactLowUsd).toBe(0);
    expect(r.impactHighUsd).toBeGreaterThan(0);
  });
  it.each([['on track', 1000], ['already exceeded (actual; the hard-block alert covers it)', 100]])('does NOT fire when %s', (_n, budget) => {
    expect(budgetRiskRule({ projectId: 'p1', projectName: 'Support', forecast: fc(budget as number) })).toBeNull();
  });
  it('never fires without enough history, even for a tiny budget', () => {
    const f = computeForecast({ now: NOW, daily: [{ date: '2026-11-14', spendUsd: 50 }, { date: '2026-11-15', spendUsd: 5 }], firstActivityDate: '2026-11-14', budgetUsd: 10 });
    expect(budgetRiskRule({ projectId: 'p1', projectName: 'Support', forecast: f })).toBeNull();
  });
});

describe('MODEL_EVALUATION', () => {
  const group = (extra: Partial<UsageGroup> = {}): UsageGroup => ({
    model: 'gpt-4o', provider: 'OPENAI', requests: 20_000, tokensIn: 40_000_000, tokensOut: 10_000_000, cachedTokensIn: 0, actualCostUsd: 200,
    avgTokensIn: 2000, p50TokensIn: 1800, p95TokensIn: 4000, maxTokensIn: 9000, avgTokensOut: 500, p50TokensOut: 400, p95TokensOut: 1200, maxTokensOut: 2000, ...extra,
  });
  const best = (g: UsageGroup, model = 'gpt-4o-mini', keyed = true) => compareGroupToCandidate(g, { model, ...PRICING_CATALOG[model] }, { hasProviderKey: keyed });

  it('fires for a large, conservative saving; ALWAYS requires approval; states cost-only', () => {
    const g = group();
    const r = modelEvaluationRule({ projectId: 'p1', projectName: 'Support', days: 30, group: g, best: best(g) })!;
    complete(r);
    expect(r.type).toBe('MODEL_EVALUATION');
    expect(r.requiresApproval).toBe(true);
    expect(r.summary).toMatch(/cost only/);
    expect(r.summary).toMatch(/nothing about whether the answers would be as good|says nothing about/);
    expect(r.action).toMatch(/does not change any model configuration/);
    expect(r.impactBasis).toMatch(/cost-only/);
    expect(r.impactLowUsd).toBeLessThanOrEqual(r.impactHighUsd!);
  });

  it('impact is monthly: the 30-day saving at 30 days, doubled when only 15 days of data exist', () => {
    const g = group();
    const c = best(g);
    expect(modelEvaluationRule({ projectId: 'p', projectName: 'x', days: 30, group: g, best: c })!.impactLowUsd).toBeCloseTo(c.savingsUsd.low, 3);
    expect(modelEvaluationRule({ projectId: 'p', projectName: 'x', days: 15, group: g, best: c })!.impactLowUsd).toBeCloseTo(c.savingsUsd.low * 2, 3);
  });

  it('confidence is NEVER "high" (price says nothing about quality); "medium" only with ≥500 requests, ≥14 days and clean checks', () => {
    const g = group();
    expect(modelEvaluationRule({ projectId: 'p', projectName: 'x', days: 30, group: g, best: best(g) })!.confidence).toBe('medium');
    expect(modelEvaluationRule({ projectId: 'p', projectName: 'x', days: 7, group: g, best: best(g) })!.confidence).toBe('low');
    expect(modelEvaluationRule({ projectId: 'p', projectName: 'x', days: 30, group: group({ requests: 300 }), best: best(group({ requests: 300 })) })!.confidence).toBe('low');
    // a warning check (no key stored for another provider) keeps it low
    const keyless = best(g, 'claude-haiku-5-5', false);
    expect(keyless.checks.some((c) => c.status === 'warn')).toBe(true);
    expect(modelEvaluationRule({ projectId: 'p', projectName: 'x', days: 30, group: g, best: keyless })!.confidence).toBe('low');
  });

  it.each([
    ['an ineligible candidate (context window too small)', () => { const g = group({ maxTokensIn: 500_000 }); return modelEvaluationRule({ projectId: 'p', projectName: 'x', days: 30, group: g, best: best(g) }); }],
    ['too few requests to rely on', () => { const g = group({ requests: THRESHOLDS.modelEvaluation.minRequests - 1 }); return modelEvaluationRule({ projectId: 'p', projectName: 'x', days: 30, group: g, best: best(g) }); }],
    ['a saving below 15%', () => { const g = group({ actualCostUsd: 7 }); return modelEvaluationRule({ projectId: 'p', projectName: 'x', days: 30, group: g, best: best(g) }); }],
    ['a more expensive candidate', () => { const g = group(); return modelEvaluationRule({ projectId: 'p', projectName: 'x', days: 30, group: g, best: best(g, 'gpt-6.2-astra') }); }],
    ['a saving only on the optimistic end (conservative end is not clearly cheaper)', () => { const g = group({ cachedTokensIn: 40_000_000, actualCostUsd: 60 }); return modelEvaluationRule({ projectId: 'p', projectName: 'x', days: 30, group: g, best: best(g, 'claude-sonnet-5-5') }); }],
  ])('does NOT fire for %s', (_n, fn) => {
    expect(fn()).toBeNull();
  });
});

describe('HIGH_TOKEN_APPLICATION', () => {
  const app = (application: string, requests: number, avgTokensPerRequest: number, costUsd = 10) => ({ application, requests, avgTokensPerRequest, costUsd, tokens: requests * avgTokensPerRequest });
  const run = (apps: any[]) => highTokenApplicationRule({ projectId: 'p1', projectName: 'Support', days: 30, apps });

  it('fires when one application averages ≥ 3× the median of its peers, and prices the excess from its own cost per token', () => {
    const r = run([app('doc-summarizer', 1000, 9000, 90), app('chat', 1000, 1000), app('search', 1000, 1200), app('faq', 1000, 800)])!;
    complete(r);
    expect(r.title).toMatch(/9\.0×/); // median of peers (1000, 1200, 800) = 1000
    // excess tokens = (9000 − 1000) × 1000 = 8,000,000 × ($90 / 9,000,000 tokens) = $80
    expect(r.impactLowUsd).toBe(80);
    expect(r.confidence).toBe('low');
    expect(r.impactBasis).toMatch(/not necessarily avoidable/);
  });
  it.each([
    ['fewer than two comparable applications', [app('only', 1000, 9000)]],
    ['peers with too little traffic to compare against', [app('a', 1000, 9000), app('b', 10, 100)]],
    ['a ratio under 3×', [app('a', 1000, 2500), app('b', 1000, 1000), app('c', 1000, 1000)]],
  ])('does NOT fire for %s', (_n, apps) => {
    expect(run(apps as any)).toBeNull();
  });
});

describe('every rule is deterministic', () => {
  it('identical inputs → identical output', () => {
    const models = [{ model: 'gpt-4o', spendUsd: 80, requests: 4000 }, { model: 'gpt-4o-mini', spendUsd: 20, requests: 9000 }];
    expect(JSON.stringify(modelConcentrationRule({ projectId: 'p', projectName: 'x', days: 30, models }))).toBe(JSON.stringify(modelConcentrationRule({ projectId: 'p', projectName: 'x', days: 30, models })));
  });
});
