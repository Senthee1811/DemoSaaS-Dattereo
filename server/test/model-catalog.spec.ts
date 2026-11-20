import { PricingService } from '../src/modules/pricing/pricing.service';
import { PricingController } from '../src/modules/pricing/pricing.controller';
import { PRICING_CATALOG } from '../src/modules/pricing/pricing.catalog';
import {
  FetchLike,
  fetchProviderModels,
  formatSyncReport,
  syncModelCatalog,
} from '../src/modules/pricing/model-catalog.sync';

const redis: any = { isConnected: false, getClient: () => null };

function row(model: string, extra: Record<string, unknown> = {}) {
  return {
    id: `id_${model}`,
    model,
    provider: 'OPENAI',
    displayName: model,
    inputPricePerMillion: '1.5000', // Prisma Decimal arrives as a string-like value
    outputPricePerMillion: '6.0000',
    cachedInputPrice: null,
    contextWindow: 100000,
    source: 'manual',
    priceUpdatedAt: new Date('2026-11-18T10:00:00Z'),
    providerStatus: null,
    providerCheckedAt: null,
    retiresAt: null,
    isActive: true,
    ...extra,
  };
}

describe('GET /api/v1/pricing serves the ModelPricing table', () => {
  it('returns exactly the table rows, not the built-in catalog', async () => {
    const rows = [
      row('db-only-model-a'),
      row('db-only-model-b', { provider: 'GEMINI', priceUpdatedAt: new Date('2026-11-19T08:30:00Z') }),
    ];
    const findMany = jest.fn().mockResolvedValue(rows);
    const service = new PricingService({ modelPricing: { findMany } } as any, redis);
    const controller = new PricingController(service);

    const res = await controller.getPricingCatalog();

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    expect(res.data.map((m) => m.model).sort()).toEqual(['db-only-model-a', 'db-only-model-b']);
    // Nothing from the hardcoded catalog leaks in when the table doesn't have it
    for (const catalogModel of Object.keys(PRICING_CATALOG)) {
      expect(res.data.find((m) => m.model === catalogModel)).toBeUndefined();
    }
    const a = res.data.find((m) => m.model === 'db-only-model-a')!;
    expect(a.inputPricePerMillion).toBe(1.5);
    expect(a.outputPricePerMillion).toBe(6);
    expect(a.source).toBe('manual');
    expect(a.updatedAt).toEqual(new Date('2026-11-18T10:00:00Z'));
  });

  it('reports the latest price change as pricingUpdatedAt and labels prices as not live', async () => {
    const service = new PricingService(
      {
        modelPricing: {
          findMany: jest.fn().mockResolvedValue([
            row('m1'),
            row('m2', { priceUpdatedAt: new Date('2026-11-19T08:30:00Z') }),
          ]),
        },
      } as any,
      redis,
    );
    const { meta } = await service.listPrices();
    expect(meta.pricingUpdatedAt).toBe('2026-11-19T08:30:00.000Z');
    expect(meta.lastAvailabilityCheckAt).toBeNull();
    expect(meta.priceSource).toMatch(/not a live feed/);
  });

  it('only falls back to the cached catalog when the database is unavailable', async () => {
    const service = new PricingService(
      { modelPricing: { findMany: jest.fn().mockRejectedValue(new Error('db down')) } } as any,
      redis,
    );
    const { models } = await service.listPrices();
    expect(models.length).toBe(Object.keys(PRICING_CATALOG).length);
    expect(models.every((m) => m.source === 'builtin_fallback')).toBe(true);
  });

  it('refresh replaces the cache so deactivated models stop being priced', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([row('gpt-4o'), row('gpt-6-luna')])
      .mockResolvedValueOnce([row('gpt-6-luna')]);
    const service = new PricingService({ modelPricing: { findMany } } as any, redis);

    await service.refreshPricingFromDb();
    expect(service.isModelPriced('gpt-4o')).toBe(true);
    await service.refreshPricingFromDb();
    expect(service.isModelPriced('gpt-4o')).toBe(false);
    expect(service.isModelPriced('gpt-6-luna')).toBe(true);
  });
});

describe('built-in catalog does not carry retired models', () => {
  it.each([
    'gpt-4-turbo',
    'gpt-3.5-turbo',
    'o1',
    'o1-mini',
    'claude-3-5-sonnet',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-exp',
  ])('%s is gone', (id) => {
    expect(PRICING_CATALOG[id]).toBeUndefined();
  });
});

describe('model catalog availability sync', () => {
  const env = {
    MODEL_CATALOG_OPENAI_API_KEY: 'sk-test',
    MODEL_CATALOG_ANTHROPIC_API_KEY: 'ak-test',
    MODEL_CATALOG_GEMINI_API_KEY: 'gk-test',
  } as unknown as NodeJS.ProcessEnv;

  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });

  function fakeDb(rowsByProvider: Record<string, any[]>) {
    const update = jest.fn().mockResolvedValue({});
    const findMany = jest.fn(async ({ where }: any) => rowsByProvider[where.provider] ?? []);
    return { db: { modelPricing: { findMany, update } }, update };
  }

  it('flags a model the provider no longer lists, and deletes nothing', async () => {
    const { db, update } = fakeDb({
      OPENAI: [row('gpt-4o'), row('gpt-retired-by-openai')],
    });
    // OpenAI's mocked response no longer includes gpt-retired-by-openai
    const fetchImpl: FetchLike = jest.fn(async (url: string) => {
      if (url.includes('api.openai.com')) {
        return ok({ object: 'list', data: [{ id: 'gpt-4o', shutdown_date: null }, { id: 'gpt-6-luna' }] });
      }
      return ok({ data: [], models: [] });
    });

    const results = await syncModelCatalog(db as any, { env, fetchImpl, now: new Date('2026-11-20T00:00:00Z') });
    const openai = results.find((r) => r.provider === 'OPENAI')!;

    expect(openai.status).toBe('ok');
    expect(openai.missing).toEqual(['gpt-retired-by-openai']);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'id_gpt-retired-by-openai' },
        data: expect.objectContaining({ providerStatus: 'missing' }),
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'id_gpt-4o' },
        data: expect.objectContaining({ providerStatus: 'available' }),
      }),
    );
    // Flag only: no row is deactivated or removed
    for (const [arg] of update.mock.calls) {
      expect(arg.data.isActive).toBeUndefined();
    }
    expect(formatSyncReport(results)).toMatch(/! gpt-retired-by-openai/);
  });

  it('strips the models/ prefix for Gemini and follows pagination', async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (url: string) => {
      calls.push(url);
      return url.includes('pageToken=p2')
        ? ok({ models: [{ name: 'models/gemini-b' }] })
        : ok({ models: [{ name: 'models/gemini-a' }], nextPageToken: 'p2' });
    };
    const ids = await fetchProviderModels('GEMINI', 'gk', fetchImpl);
    expect(ids.map((m) => m.id)).toEqual(['gemini-a', 'gemini-b']);
    expect(calls).toHaveLength(2);
  });

  it('records retirement dates reported by the provider', async () => {
    const { db, update } = fakeDb({ ANTHROPIC: [row('claude-sonnet-4-5-20250929', { provider: 'ANTHROPIC' })] });
    const fetchImpl: FetchLike = async (url: string) =>
      url.includes('anthropic.com')
        ? ok({
            data: [{ id: 'claude-sonnet-4-5-20250929', retires_at: '2026-11-30T00:00:00Z' }],
            has_more: false,
          })
        : ok({ data: [], models: [] });
    const results = await syncModelCatalog(db as any, {
      env: { MODEL_CATALOG_ANTHROPIC_API_KEY: 'ak' } as any,
      fetchImpl,
    });
    const anthropic = results.find((r) => r.provider === 'ANTHROPIC')!;
    expect(anthropic.missing).toEqual([]);
    expect(anthropic.retiring).toEqual([
      { model: 'claude-sonnet-4-5-20250929', retiresAt: '2026-11-30T00:00:00.000Z' },
    ]);
    expect(update.mock.calls[0][0].data.retiresAt).toEqual(new Date('2026-11-30T00:00:00Z'));
  });

  it('skips providers without a key and leaves their rows untouched', async () => {
    const { db, update } = fakeDb({ OPENAI: [row('gpt-4o')] });
    const fetchImpl = jest.fn();
    const results = await syncModelCatalog(db as any, { env: {} as any, fetchImpl: fetchImpl as any });
    expect(results.every((r) => r.status === 'skipped')).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('does not flag anything when the provider call fails or returns nothing', async () => {
    const { db, update } = fakeDb({ OPENAI: [row('gpt-4o')] });
    const failing: FetchLike = async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => 'bad key' });
    let results = await syncModelCatalog(db as any, { env, fetchImpl: failing });
    expect(results.find((r) => r.provider === 'OPENAI')!.status).toBe('error');

    const empty: FetchLike = async () => ok({ data: [], models: [] });
    results = await syncModelCatalog(db as any, { env, fetchImpl: empty });
    expect(results.find((r) => r.provider === 'OPENAI')!.status).toBe('error');
    expect(update).not.toHaveBeenCalled();
  });
});
