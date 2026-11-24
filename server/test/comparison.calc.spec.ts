import 'reflect-metadata';
import { ANTHROPIC_TOKENIZER_FACTOR, CandidateModel, compareGroupToCandidate, GATEWAY_LIMITATIONS, NOT_ASSESSED, rankComparisons, UsageGroup } from '../src/modules/insights/calc/comparison.calc';
import { computeCost } from '../src/modules/pricing/pricing.service';
import { PRICING_CATALOG } from '../src/modules/pricing/pricing.catalog';

const cand = (model: string, extra: Partial<CandidateModel> = {}): CandidateModel => ({ model, ...PRICING_CATALOG[model], ...extra });

/** 10,000 requests: 2,000 input + 500 output tokens each, on gpt-4o ($2.50 in / $10 out per million) */
const group = (extra: Partial<UsageGroup> = {}): UsageGroup => ({
  model: 'gpt-4o', provider: 'OPENAI', requests: 10_000, tokensIn: 20_000_000, tokensOut: 5_000_000, cachedTokensIn: 0,
  actualCostUsd: 20_000_000 * 2.5 / 1e6 + 5_000_000 * 10 / 1e6, // $100
  avgTokensIn: 2000, p50TokensIn: 1800, p95TokensIn: 4000, maxTokensIn: 9000, avgTokensOut: 500, p50TokensOut: 400, p95TokensOut: 1200, maxTokensOut: 2000, ...extra,
});

describe('hypothetical cost: the same historical tokens re-priced', () => {
  it('actual cost of the fixture is $100 (50 input + 50 output)', () => {
    expect(group().actualCostUsd).toBe(100);
  });

  it('same-provider cheaper model: hypothetical = tokens × the candidate\'s configured prices (hand-computed)', () => {
    // gpt-4o-mini: $0.15 in / $0.60 out → 20M×0.15/1M + 5M×0.60/1M = 3 + 3 = $6
    const c = compareGroupToCandidate(group(), cand('gpt-4o-mini'), { hasProviderKey: true });
    expect(c.hypotheticalUsd).toEqual({ low: 6, high: 6 });
    expect(c.savingsUsd).toEqual({ low: 94, high: 94 });
    expect(c.savingsPercent).toEqual({ low: 94, high: 94 });
    expect(computeCost(cand('gpt-4o-mini'), 20_000_000, 5_000_000)).toBe(6);
  });

  it('a MORE expensive model gives a negative saving (the engine does not only say good news)', () => {
    const c = compareGroupToCandidate(group(), cand('gpt-6.2-astra'), { hasProviderKey: true }); // $8 in / $40 out
    expect(c.hypotheticalUsd.low).toBe(20_000_000 * 8 / 1e6 + 5_000_000 * 40 / 1e6); // 360
    expect(c.savingsUsd.low).toBeLessThan(0);
    expect(c.savingsUsd.high).toBeLessThan(0);
  });

  it('observed prompt-cache hits carry over where the candidate has a cached price (low end), and not at all on the high end', () => {
    const cached = group({ cachedTokensIn: 10_000_000 }); // half of the input was cached
    const c = compareGroupToCandidate(cached, cand('gpt-6.2-sol'), { hasProviderKey: true }); // $2 in, $0.10 cached, $10 out
    const low = 10_000_000 * 2 / 1e6 + 10_000_000 * 0.1 / 1e6 + 5_000_000 * 10 / 1e6; // 20 + 1 + 50 = 71
    const high = 20_000_000 * 2 / 1e6 + 5_000_000 * 10 / 1e6; // 40 + 50 = 90
    expect(c.hypotheticalUsd.low).toBeCloseTo(low, 5);
    expect(c.hypotheticalUsd.high).toBeCloseTo(high, 5);
    expect(c.assumptions.join(' ')).toMatch(/cache hit rate \(50% of input\)/);
  });

  it('a candidate without a cached price prices cached input at the full rate and says so', () => {
    const c = compareGroupToCandidate(group({ cachedTokensIn: 10_000_000 }), cand('gemini-3.5-flash-lite'), { hasProviderKey: true });
    expect(c.candidate.cachedInputPrice).toBeNull();
    expect(c.hypotheticalUsd.low).toBe(c.hypotheticalUsd.high);
    expect(c.assumptions.join(' ')).toMatch(/no cached-input price/);
  });

  it('moving to Anthropic widens the HIGH end by the documented ~30% tokenizer effect on input tokens only', () => {
    const c = compareGroupToCandidate(group(), cand('claude-sonnet-5-5'), { hasProviderKey: true }); // $2 in / $10 out
    expect(c.hypotheticalUsd.low).toBe(20_000_000 * 2 / 1e6 + 5_000_000 * 10 / 1e6); // 90
    expect(c.hypotheticalUsd.high).toBeCloseTo(20_000_000 * ANTHROPIC_TOKENIZER_FACTOR * 2 / 1e6 + 5_000_000 * 10 / 1e6, 4); // 52 + 50 = 102
    expect(c.assumptions.join(' ')).toMatch(/documented ~30%/);
    expect(c.savingsUsd.low).toBeCloseTo(100 - 102, 4); // the conservative saving is negative: not a clear win
  });

  it('moving from Anthropic to another provider does NOT claim a tokenizer saving it cannot measure', () => {
    const g = group({ model: 'claude-sonnet-5-5', provider: 'ANTHROPIC', actualCostUsd: 90 });
    const c = compareGroupToCandidate(g, cand('gpt-4o'), { hasProviderKey: true });
    expect(c.assumptions.join(' ')).toMatch(/unmeasured/);
    expect(c.hypotheticalUsd.low).toBe(c.hypotheticalUsd.high);
  });

  it('savings are a RANGE: low = actual − hypothetical high, high = actual − hypothetical low', () => {
    const c = compareGroupToCandidate(group({ cachedTokensIn: 10_000_000 }), cand('gpt-6.2-sol'), { hasProviderKey: true });
    expect(c.savingsUsd.low).toBeCloseTo(100 - c.hypotheticalUsd.high, 5);
    expect(c.savingsUsd.high).toBeCloseTo(100 - c.hypotheticalUsd.low, 5);
    expect(c.savingsUsd.low).toBeLessThanOrEqual(c.savingsUsd.high);
  });

  it('zero actual spend yields no percentage (never NaN/Infinity)', () => {
    const c = compareGroupToCandidate(group({ actualCostUsd: 0 }), cand('gpt-4o-mini'), { hasProviderKey: true });
    expect(c.savingsPercent).toEqual({ low: null, high: null });
  });
});

describe('never claims quality equivalence; always requires a human', () => {
  const c = compareGroupToCandidate(group(), cand('gpt-4o-mini'), { hasProviderKey: true });
  it('qualityEquivalence is "not_assessed" and approval is required on every comparison', () => {
    expect(c.qualityEquivalence).toBe('not_assessed');
    expect(c.requiresHumanApproval).toBe(true);
  });
  it('lists what was NOT assessed and what the gateway cannot do', () => {
    expect(NOT_ASSESSED).toEqual(expect.arrayContaining(['output quality', 'latency', 'tool / function calling', 'vision']));
    expect(GATEWAY_LIMITATIONS.join(' ')).toMatch(/text chat completions only/);
  });
  it('nothing in the result uses wording that implies equivalence', () => {
    expect(JSON.stringify(c)).not.toMatch(/equivalent|as good|same quality|drop-in/i);
  });
});

describe('compatibility checks', () => {
  it('FAIL: the largest prompt ever seen exceeds the candidate\'s context window → ineligible', () => {
    const c = compareGroupToCandidate(group({ maxTokensIn: 200_000 }), cand('gpt-4o-mini'), { hasProviderKey: true }); // window 128,000
    expect(c.checks.find((x) => x.id === 'context_window')!.status).toBe('fail');
    expect(c.eligible).toBe(false);
  });
  it('WARN: prompt + reply use over 80% of the window', () => {
    const c = compareGroupToCandidate(group({ maxTokensIn: 100_000, maxTokensOut: 5_000 }), cand('gpt-4o-mini'), { hasProviderKey: true });
    expect(c.checks.find((x) => x.id === 'context_window')!.status).toBe('warn');
    expect(c.eligible).toBe(true);
  });
  it('UNKNOWN: the catalog has no context window (honest, not assumed to fit)', () => {
    const c = compareGroupToCandidate(group(), cand('gemini-3.5-flash-lite'), { hasProviderKey: true });
    expect(c.checks.find((x) => x.id === 'context_window')!.status).toBe('unknown');
  });
  it('PASS when it fits comfortably', () => {
    expect(compareGroupToCandidate(group(), cand('gpt-4o-mini'), { hasProviderKey: true }).checks.find((x) => x.id === 'context_window')!.status).toBe('pass');
  });
  it('WARN when another provider has no stored key for the scope; PASS for the same provider', () => {
    expect(compareGroupToCandidate(group(), cand('claude-haiku-5-5'), { hasProviderKey: false }).checks.find((x) => x.id === 'provider_key')!.status).toBe('warn');
    expect(compareGroupToCandidate(group(), cand('gpt-4o-mini'), { hasProviderKey: false }).checks.find((x) => x.id === 'provider_key')!.status).toBe('pass');
  });
  it('WARN when the provider no longer lists the model, or a retirement is announced', () => {
    expect(compareGroupToCandidate(group(), cand('gpt-4o-mini', { providerStatus: 'missing' }), { hasProviderKey: true }).checks.find((x) => x.id === 'lifecycle')!.status).toBe('warn');
    const r = compareGroupToCandidate(group(), cand('gpt-4o-mini', { retiresAt: new Date('2027-01-14') }), { hasProviderKey: true });
    expect(r.checks.find((x) => x.id === 'lifecycle')!.detail).toMatch(/2027-01-14/);
  });
});

describe('ranking', () => {
  it('eligible candidates first, then by the CONSERVATIVE saving (the low end), so a risky saving cannot outrank a safe one', () => {
    const g = group({ maxTokensIn: 200_000 });
    const list = [
      compareGroupToCandidate(g, cand('gpt-4o-mini'), { hasProviderKey: true }), // cheapest but ineligible (context window)
      compareGroupToCandidate(g, cand('gpt-6.1-terra'), { hasProviderKey: true }), // 1M window: eligible
      compareGroupToCandidate(g, cand('claude-sonnet-5-5'), { hasProviderKey: true }), // eligible, conservative saving is negative
    ];
    const ranked = rankComparisons(list).map((c) => c.candidate.model);
    expect(ranked[0]).toBe('gpt-6.1-terra');
    expect(ranked[ranked.length - 1]).toBe('gpt-4o-mini'); // ineligible last despite the lowest price
  });
});
