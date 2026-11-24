import 'reflect-metadata';
import { HttpException } from '@nestjs/common';
import { PricingService, PRICING_VERSION_KEY, computeMaxCost } from '../src/modules/pricing/pricing.service';
import { PRICING_CATALOG } from '../src/modules/pricing/pricing.catalog';
import { FakeKv } from './helpers/fakes';

/** A Postgres `model_pricing` stand-in. `updatedAt` is assigned at COMMIT time, like @updatedAt. */
class FakePricingTable {
  rows = new Map<string, any>();
  // Relative to the real clock (an hour ahead): rows written "during" a reload must look newer than the reload's own
  // start time. A hard-coded date made this suite start failing once the real clock passed it.
  clock = Date.now() + 3_600_000;
  failUpserts = false;
  /** Delay before an upsert's RESPONSE reaches the caller (the commit has already happened). */
  responseDelayMs: (model: string) => number = () => 0;
  /** If set, findMany waits on this gate before answering (it still reads the table AT CALL TIME). */
  findManyGate: Promise<void> | null = null;
  upsertCalls = 0;

  modelPricing = {
    createMany: async () => ({ count: 0 }),
    findMany: async ({ where }: any = {}) => {
      const snapshot = [...this.rows.values()].filter((r) => (where?.isActive ? r.isActive : true)).map((r) => ({ ...r }));
      if (this.findManyGate) await this.findManyGate;
      return snapshot;
    },
    upsert: async ({ where, update, create }: any) => {
      this.upsertCalls++;
      if (this.failUpserts) throw Object.assign(new Error('password authentication failed for user "spendguard"'), { code: 'P1000' });
      const existing = this.rows.get(where.model);
      const updatedAt = new Date(this.clock++);
      const row = existing ? { ...existing, ...stripUndefined(update), updatedAt } : { cachedInputPrice: null, displayName: null, contextWindow: null, source: 'manual', priceUpdatedAt: updatedAt, ...stripUndefined(create), updatedAt };
      this.rows.set(where.model, row);
      const delay = this.responseDelayMs(where.model);
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return { ...row };
    },
  };
}
const stripUndefined = (o: any) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const redisFor = (kv: FakeKv, extra: any = {}) => ({
  getCache: kv.getCache,
  incrCache: async (key: string) => {
    if (kv.down) return null;
    const next = String(Number((await kv.getCache(key)) ?? 0) + 1);
    await kv.setCache(key, next);
    return Number(next);
  },
  ...extra,
});

const seeded = (table: FakePricingTable, model = 'gpt-4o') => {
  const c = PRICING_CATALOG[model];
  table.rows.set(model, {
    model, provider: c.provider, displayName: c.displayName, inputPricePerMillion: c.inputPricePerMillion, outputPricePerMillion: c.outputPricePerMillion,
    cachedInputPrice: c.cachedInputPrice ?? null, contextWindow: c.contextWindow ?? null, source: 'manual', isActive: true,
    priceUpdatedAt: new Date(table.clock - 1000), updatedAt: new Date(table.clock - 1000),
  });
};
const make = async (table: FakePricingTable, kv = new FakeKv()) => {
  const svc = new PricingService(table as any, redisFor(kv) as any);
  await svc.refreshPricingFromDb();
  return svc;
};
const body = (extra: any = {}) => ({ model: 'gpt-4o', provider: 'OPENAI' as const, inputPricePerMillion: 3, outputPricePerMillion: 12, ...extra });
const errOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as HttpException;
  }
  throw new Error('expected a throw');
};
const codeOf = (e: HttpException) => (e.getResponse() as any).error.code;

describe('a failed database write is never reported as success', () => {
  it('throws 503 pricing_persist_failed, keeps the previous price, and says so', async () => {
    const t = new FakePricingTable();
    seeded(t);
    const svc = await make(t);
    const before = svc.calculateCost('gpt-4o', 1_000_000, 1_000_000);
    t.failUpserts = true;

    const e = await errOf(svc.upsertModelPrice(body({ inputPricePerMillion: 99, outputPricePerMillion: 99 })));
    expect(e.getStatus()).toBe(503);
    expect(codeOf(e)).toBe('pricing_persist_failed');
    expect((e.getResponse() as any).error.message).toContain('NOT changed');
    // the old price is still what the gateway uses, and the table is untouched
    expect(svc.calculateCost('gpt-4o', 1_000_000, 1_000_000)).toBe(before);
    expect(t.rows.get('gpt-4o')!.inputPricePerMillion).toBe(2.5);
  });

  it('does not leak the database error text, and does not bump the version other instances watch', async () => {
    const t = new FakePricingTable();
    seeded(t);
    const kv = new FakeKv();
    const svc = new PricingService(t as any, redisFor(kv) as any);
    t.failUpserts = true;
    const e = await errOf(svc.upsertModelPrice(body()));
    expect(JSON.stringify(e.getResponse())).not.toContain('password authentication');
    expect(await kv.getCache(PRICING_VERSION_KEY)).toBeNull();
  });

  it('a model that does not exist yet is NOT created in memory when the write fails (no phantom price)', async () => {
    const t = new FakePricingTable();
    const svc = await make(t);
    t.failUpserts = true;
    await errOf(svc.upsertModelPrice(body({ model: 'brand-new-model' })));
    expect(svc.isModelPriced('brand-new-model')).toBe(false);
  });

  it('an upsert that returns nothing is also a failure, not a success', async () => {
    const t = new FakePricingTable();
    t.modelPricing.upsert = (async () => undefined) as any;
    const svc = await make(t);
    expect(codeOf(await errOf(svc.upsertModelPrice(body())))).toBe('pricing_persist_failed');
  });

  it('a failed periodic reload keeps every valid price (it never falls back to a smaller set)', async () => {
    const t = new FakePricingTable();
    seeded(t);
    const svc = await make(t);
    t.modelPricing.findMany = (async () => {
      throw new Error('db down');
    }) as any;
    await svc.refreshPricingFromDb();
    expect(svc.isModelPriced('gpt-4o')).toBe(true);
  });
});

describe('price input validation (the admin endpoint passed its body straight through before)', () => {
  const bad: Array<[string, any]> = [
    ['negative input price', { inputPricePerMillion: -1 }],
    ['NaN output price', { outputPricePerMillion: NaN }],
    ['Infinity', { inputPricePerMillion: Infinity }],
    ['string price', { inputPricePerMillion: '3' }],
    ['missing output price', { outputPricePerMillion: undefined }],
    ['absurdly large price (column is Decimal(10,4))', { inputPricePerMillion: 1e9 }],
    ['unknown provider', { provider: 'MISTRAL' }],
    ['empty model', { model: '   ' }],
    ['non-string model', { model: 42 }],
    ['cached price above input price', { cachedInputPrice: 99 }],
    ['non-integer context window', { contextWindow: 1.5 }],
  ];
  it.each(bad)('rejects %s with 400 invalid_price and never touches the database', async (_n, patch) => {
    const t = new FakePricingTable();
    const svc = await make(t);
    const e = await errOf(svc.upsertModelPrice(body(patch)));
    expect(e.getStatus()).toBe(400);
    expect(codeOf(e)).toBe('invalid_price');
    expect(t.upsertCalls).toBe(0);
  });

  it('accepts a valid body and rounds rates to the 4 decimals the column stores', async () => {
    const t = new FakePricingTable();
    seeded(t);
    const svc = await make(t);
    const row = await svc.upsertModelPrice(body({ inputPricePerMillion: 2.123456, cachedInputPrice: 1.5 }));
    expect(row.inputPricePerMillion).toBe(2.1235);
    expect(svc.getModelPrice('gpt-4o')).toMatchObject({ inputPricePerMillion: 2.1235, cachedInputPrice: 1.5 });
  });
});

describe('successful writes', () => {
  it('cache the row the DATABASE returned, keep the cached rate, and bump the version', async () => {
    const t = new FakePricingTable();
    seeded(t);
    const kv = new FakeKv();
    const svc = await make(t, kv);
    await svc.upsertModelPrice(body());
    expect(svc.getModelPrice('gpt-4o')).toMatchObject({ inputPricePerMillion: 3, outputPricePerMillion: 12, cachedInputPrice: 1.25 });
    expect(await kv.getCache(PRICING_VERSION_KEY)).toBe('1');
    await svc.upsertModelPrice(body({ outputPricePerMillion: 13 }));
    expect(await kv.getCache(PRICING_VERSION_KEY)).toBe('2');
  });

  it('a failure to publish the version does not turn a committed write into an error', async () => {
    const t = new FakePricingTable();
    seeded(t);
    const svc = new PricingService(t as any, { getCache: async () => null, incrCache: async () => { throw new Error('redis exploded'); } } as any);
    await svc.refreshPricingFromDb();
    await expect(svc.upsertModelPrice(body())).resolves.toMatchObject({ inputPricePerMillion: 3 });
    expect(svc.getModelPrice('gpt-4o')!.inputPricePerMillion).toBe(3);
  });
});

describe('concurrent price updates', () => {
  it('20 simultaneous writes to one model: memory ends equal to the database row, not to whichever response landed last', async () => {
    const t = new FakePricingTable();
    seeded(t);
    const svc = await make(t);
    // responses come back in a scrambled order
    t.responseDelayMs = () => Math.floor(Math.random() * 25);
    await Promise.all(Array.from({ length: 20 }, (_, i) => svc.upsertModelPrice(body({ inputPricePerMillion: 3 + i, outputPricePerMillion: 20 + i }))));
    const dbRow = t.rows.get('gpt-4o')!;
    expect(svc.getModelPrice('gpt-4o')!.inputPricePerMillion).toBe(dbRow.inputPricePerMillion);
    expect(svc.getModelPrice('gpt-4o')!.outputPricePerMillion).toBe(dbRow.outputPricePerMillion);
    // and a fresh reload agrees
    await svc.refreshPricingFromDb();
    expect(svc.getModelPrice('gpt-4o')!.inputPricePerMillion).toBe(dbRow.inputPricePerMillion);
  });

  it('an OLDER write whose response arrives late cannot overwrite a NEWER one already applied', async () => {
    const t = new FakePricingTable();
    seeded(t);
    const svc = await make(t);
    // A commits first (older updatedAt) but its response is slow; B commits second and returns at once
    t.responseDelayMs = (() => {
      let n = 0;
      return () => (n++ === 0 ? 60 : 0);
    })();
    const a = svc.upsertModelPrice(body({ inputPricePerMillion: 5, outputPricePerMillion: 50 }));
    const b = svc.upsertModelPrice(body({ inputPricePerMillion: 7, outputPricePerMillion: 70 }));
    await Promise.all([a, b]);
    expect(t.rows.get('gpt-4o')!.inputPricePerMillion).toBe(7); // B is the database's last writer
    expect(svc.getModelPrice('gpt-4o')!.inputPricePerMillion).toBe(7); // and the cache agrees (A's late response was ignored)
  });

  it('writes to different models do not interfere', async () => {
    const t = new FakePricingTable();
    seeded(t, 'gpt-4o');
    seeded(t, 'gpt-4o-mini');
    const svc = await make(t);
    await Promise.all([
      svc.upsertModelPrice(body({ model: 'gpt-4o', inputPricePerMillion: 4 })),
      svc.upsertModelPrice(body({ model: 'gpt-4o-mini', inputPricePerMillion: 0.2, outputPricePerMillion: 0.7 })),
    ]);
    expect(svc.getModelPrice('gpt-4o')!.inputPricePerMillion).toBe(4);
    expect(svc.getModelPrice('gpt-4o-mini')!.inputPricePerMillion).toBe(0.2);
  });

  it('a reload that began BEFORE a write cannot clobber it when it finishes AFTER (stale snapshot race)', async () => {
    const t = new FakePricingTable();
    seeded(t);
    const svc = await make(t);

    let release!: () => void;
    t.findManyGate = new Promise<void>((r) => (release = r));
    const reload = svc.refreshPricingFromDb(); // reads the OLD table now, answers later

    t.findManyGate = null;
    await svc.upsertModelPrice(body({ inputPricePerMillion: 9, outputPricePerMillion: 90 }));
    await svc.upsertModelPrice(body({ model: 'created-during-reload', inputPricePerMillion: 1, outputPricePerMillion: 2 }));
    release();
    await reload;

    expect(svc.getModelPrice('gpt-4o')!.inputPricePerMillion).toBe(9);
    expect(svc.isModelPriced('created-during-reload')).toBe(true);
  });
});

describe('several application instances', () => {
  it('instance B serves the old price until it syncs, then picks up A\'s write (version bump)', async () => {
    const t = new FakePricingTable();
    seeded(t);
    const kv = new FakeKv();
    const a = await make(t, kv);
    const b = await make(t, kv);
    expect(await b.syncPricingOnce()).toBe('unchanged'); // nothing bumped yet

    await a.upsertModelPrice(body({ inputPricePerMillion: 4, outputPricePerMillion: 16 }));
    expect(b.getModelPrice('gpt-4o')!.inputPricePerMillion).toBe(2.5); // stale for at most one sync interval
    expect(await b.syncPricingOnce()).toBe('refreshed');
    expect(b.getModelPrice('gpt-4o')).toMatchObject({ inputPricePerMillion: 4, outputPricePerMillion: 16 });
    expect(await b.syncPricingOnce()).toBe('unchanged');
  });

  it('Redis down: the version is unreadable, but the periodic full reload still converges', async () => {
    const t = new FakePricingTable();
    seeded(t);
    const kv = new FakeKv();
    const a = await make(t, kv);
    const b = await make(t, kv);
    kv.down = true;
    await a.upsertModelPrice(body({ inputPricePerMillion: 4 })); // version bump is lost
    expect(await b.syncPricingOnce(3)).toBe('unchanged');
    expect(await b.syncPricingOnce(3)).toBe('unchanged');
    expect(await b.syncPricingOnce(3)).toBe('refreshed'); // every 3rd tick here (every 12th by default)
    expect(b.getModelPrice('gpt-4o')!.inputPricePerMillion).toBe(4);
  });

  it('the background timer started by onModuleInit syncs on its own and is cleaned up on destroy', async () => {
    process.env.PRICING_SYNC_INTERVAL_MS = '20';
    try {
      const t = new FakePricingTable();
      seeded(t);
      const kv = new FakeKv();
      const a = await make(t, kv);
      const b = new PricingService(t as any, redisFor(kv) as any);
      await b.onModuleInit();
      await a.upsertModelPrice(body({ inputPricePerMillion: 6 }));
      for (let i = 0; i < 50 && b.getModelPrice('gpt-4o')!.inputPricePerMillion !== 6; i++) await new Promise((r) => setTimeout(r, 20));
      expect(b.getModelPrice('gpt-4o')!.inputPricePerMillion).toBe(6);
      b.onModuleDestroy();
    } finally {
      delete process.env.PRICING_SYNC_INTERVAL_MS;
    }
  });
});

describe('price snapshot consistency', () => {
  it('the hold and the settlement are computed from ONE row, so an admin edit between them cannot split them', async () => {
    const t = new FakePricingTable();
    seeded(t);
    const svc = await make(t);
    const snapshot = svc.requireModelPrice('gpt-4o');
    const hold = computeMaxCost(snapshot, 1000, 500);
    await svc.upsertModelPrice(body({ inputPricePerMillion: 50, outputPricePerMillion: 500 }));
    expect(computeMaxCost(snapshot, 1000, 500)).toBe(hold); // the in-flight request still sees its own row
    expect(computeMaxCost(svc.requireModelPrice('gpt-4o'), 1000, 500)).toBeGreaterThan(hold); // new requests see the new price
  });

  it('estimateMaxCost is exactly computeMaxCost on the current row', async () => {
    const svc = await make(new FakePricingTable());
    expect(svc.estimateMaxCost('gpt-4o', 1234, 567)).toBe(computeMaxCost(svc.requireModelPrice('gpt-4o'), 1234, 567));
  });
});
