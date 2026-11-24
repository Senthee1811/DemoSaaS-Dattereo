import 'reflect-metadata';
import { HttpException } from '@nestjs/common';
import { PricingService, computeCost } from '../src/modules/pricing/pricing.service';
import { PRICING_CATALOG } from '../src/modules/pricing/pricing.catalog';

const redis: any = { isConnected: false, getClient: () => null };
const makePricing = (rows: any[] = []) => new PricingService({ modelPricing: { findMany: async () => rows } } as any, redis);
const pricing = makePricing();

describe('cached input pricing', () => {
  // gpt-4o: input $2.50/M, cached $1.25/M, output $10/M
  it('bills cached tokens at cachedInputPrice, the rest at the input price', () => {
    // 2000 in (1500 cached, 500 fresh), 100 out
    const cost = pricing.calculateCost('gpt-4o', 2000, 100, { cachedTokens: 1500 });
    const expected = (500 * 2.5 + 1500 * 1.25 + 100 * 10) / 1_000_000;
    expect(cost).toBeCloseTo(expected, 9);
  });

  it('is cheaper than the uncached price, and identical when nothing is cached', () => {
    const plain = pricing.calculateCost('gpt-4o', 2000, 100);
    expect(pricing.calculateCost('gpt-4o', 2000, 100, { cachedTokens: 1500 })).toBeLessThan(plain);
    expect(pricing.calculateCost('gpt-4o', 2000, 100, { cachedTokens: 0 })).toBe(plain);
    expect(pricing.calculateCost('gpt-4o', 2000, 100, {})).toBe(plain);
  });

  it('a model with NO cachedInputPrice bills cached tokens at the full input price (never invents a discount)', () => {
    expect(PRICING_CATALOG['gemini-3.5-flash-lite'].cachedInputPrice).toBeUndefined();
    const plain = pricing.calculateCost('gemini-3.5-flash-lite', 5000, 10);
    expect(pricing.calculateCost('gemini-3.5-flash-lite', 5000, 10, { cachedTokens: 4000 })).toBe(plain);
  });

  it('clamps: cached can never exceed the input, negatives are ignored', () => {
    const allCached = pricing.calculateCost('gpt-4o', 1000, 0, { cachedTokens: 999999 });
    expect(allCached).toBeCloseTo((1000 * 1.25) / 1_000_000, 9);
    expect(pricing.calculateCost('gpt-4o', 1000, 0, { cachedTokens: -50 })).toBe(pricing.calculateCost('gpt-4o', 1000, 0));
  });

  it('Anthropic: cache reads at the cached rate, writes at the documented 1.25x (5m) / 2x (1h) of the input price', () => {
    // claude-sonnet-5-5: input $2/M, cached $0.10/M, output $10/M
    const cost = pricing.calculateCost('claude-sonnet-5-5', 100_000 + 1500 + 500 + 50, 10, {
      cachedTokens: 100_000,
      cacheWriteTokens: { fiveMinute: 1500, oneHour: 500 },
    });
    const expected = (50 * 2 + 100_000 * 0.1 + 1500 * 2 * 1.25 + 500 * 2 * 2 + 10 * 10) / 1_000_000;
    expect(cost).toBeCloseTo(expected, 9);
  });

  it('catalog cached rates match the documented Anthropic read multipliers (Fable 0.025x, Opus/Sonnet 0.05x, others 0.1x)', () => {
    const ratio = (m: string) => PRICING_CATALOG[m].cachedInputPrice! / PRICING_CATALOG[m].inputPricePerMillion;
    expect(ratio('claude-fable-5-2')).toBeCloseTo(0.025, 6);
    expect(ratio('claude-opus-5-5')).toBeCloseTo(0.05, 6);
    expect(ratio('claude-sonnet-5-5')).toBeCloseTo(0.05, 6);
    expect(ratio('claude-haiku-5-5')).toBeCloseTo(0.1, 6);
  });

  it('computeCost works on a price SNAPSHOT: later edits to the table cannot change an in-flight request', () => {
    const row = pricing.requireModelPrice('gpt-4o');
    const snapshot = { ...row };
    const before = computeCost(snapshot, 1000, 1000, { cachedTokens: 500 });
    // the live cache entry is replaced (admin edit) after the snapshot was taken
    (pricing as any).memoryCache.set('gpt-4o', { ...row, inputPricePerMillion: 999, outputPricePerMillion: 999 });
    expect(computeCost(snapshot, 1000, 1000, { cachedTokens: 500 })).toBe(before);
  });

  it('the admin upsert keeps the cached rate in the in-memory price (it used to be dropped)', async () => {
    const row = {
      model: 'gpt-4o', provider: 'OPENAI', displayName: 'GPT-4o', inputPricePerMillion: 3, outputPricePerMillion: 12,
      cachedInputPrice: 1.5, contextWindow: 128000, source: 'manual', priceUpdatedAt: new Date(), isActive: true,
    };
    const db: any = { modelPricing: { findMany: async () => [], upsert: jest.fn(async () => row) } };
    const svc = new PricingService(db, redis);
    await svc.upsertModelPrice({ model: 'gpt-4o', provider: 'OPENAI', inputPricePerMillion: 3, outputPricePerMillion: 12 });
    expect(svc.getModelPrice('gpt-4o')?.cachedInputPrice).toBe(1.5);
    expect(svc.calculateCost('gpt-4o', 1000, 0, { cachedTokens: 1000 })).toBeCloseTo((1000 * 1.5) / 1_000_000, 9);
  });

  it('the worst-case reservation assumes NO caching (so a hold is never smaller than the real cost)', () => {
    const max = pricing.estimateMaxCost('gpt-4o', 2000, 100);
    expect(max).toBeGreaterThanOrEqual(pricing.calculateCost('gpt-4o', 2000, 100, { cachedTokens: 2000 }));
    expect(max).toBe(pricing.calculateCost('gpt-4o', 2000, 100));
  });
});

describe('unknown models never receive another model\'s price', () => {
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      const h = e as HttpException;
      return { status: h.getStatus(), code: (h.getResponse() as any).error.code };
    }
    return null;
  };

  it.each(['gpt-4o-2024-08-06', 'GPT-4O', 'gpt-4o ', 'claude-sonnet', 'gemini-9', 'totally-unknown', ''])(
    'calculateCost / estimateMaxCost / requireModelPrice reject "%s" with 400 model_not_priced',
    (model) => {
      expect(pricing.isModelPriced(model)).toBe(false);
      expect(code(() => pricing.calculateCost(model, 1, 1))).toEqual({ status: 400, code: 'model_not_priced' });
      expect(code(() => pricing.estimateMaxCost(model, 1, 1))).toEqual({ status: 400, code: 'model_not_priced' });
      expect(code(() => pricing.requireModelPrice(model))).toEqual({ status: 400, code: 'model_not_priced' });
    },
  );

  it('provider-prefix routing does not create a price: a Groq-shaped or claude-shaped unknown id is still unpriced', () => {
    expect(pricing.resolveProvider('llama-3.3-70b-versatile')).toBe('GROQ');
    expect(pricing.isModelPriced('llama-3.3-70b-versatile')).toBe(false);
    expect(pricing.resolveProvider('claude-future-9')).toBe('ANTHROPIC');
    expect(pricing.isModelPriced('claude-future-9')).toBe(false);
  });

  it('a model deactivated in the table stops being priced (the table wins over the built-in catalog)', async () => {
    const onlyOne = [{ model: 'gpt-4o', provider: 'OPENAI', inputPricePerMillion: 2.5, outputPricePerMillion: 10, isActive: true, source: 'manual' }];
    const svc = makePricing(onlyOne);
    await svc.refreshPricingFromDb();
    expect(svc.isModelPriced('gpt-4o')).toBe(true);
    expect(svc.isModelPriced('gpt-4o-mini')).toBe(false); // in the catalog, not in the active rows
    expect(code(() => svc.calculateCost('gpt-4o-mini', 1, 1))).toEqual({ status: 400, code: 'model_not_priced' });
  });

  it('the unpriced Groq models documented in the catalog stay unpriced', () => {
    expect(pricing.isModelPriced('llama-3.1-8b-instant')).toBe(false);
    expect(pricing.isModelPriced('llama-3.3-70b-versatile')).toBe(false);
  });
});
