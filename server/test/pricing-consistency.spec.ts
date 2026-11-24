import 'reflect-metadata';
import { PricingService, computeCost } from '../src/modules/pricing/pricing.service';

/**
 * Several application instances share one pricing table and one Redis version counter, but each holds its own cache.
 * These tests drive real PricingService instances against a shared fake table/Redis and assert the documented
 * consistency rules (docs/FINANCIAL_RECONCILIATION.md, "Pricing snapshots").
 */
function world() {
  const rows = new Map<string, any>();
  let version: string | null = null;
  const state = { redisUp: true, dbUp: true, clock: Date.now() + 3_600_000 };
  const tick = () => new Date((state.clock += 1000));
  const prisma: any = {
    modelPricing: {
      findMany: async () => {
        if (!state.dbUp) throw new Error('db down');
        return [...rows.values()].filter((r) => r.isActive).map((r) => ({ ...r }));
      },
      createMany: async () => ({ count: 0 }),
      upsert: async ({ where, update, create }: any) => {
        if (!state.dbUp) throw new Error('db down');
        const cur = rows.get(where.model);
        const row = cur ? { ...cur, ...update, updatedAt: tick() } : { ...create, id: where.model, isActive: true, source: 'manual', priceUpdatedAt: tick(), updatedAt: tick() };
        rows.set(where.model, row);
        return { ...row };
      },
    },
  };
  const redis: any = {
    isConnected: true,
    getClient: () => null,
    getCache: async () => (state.redisUp ? version : null),
    incrCache: async () => {
      if (!state.redisUp) throw new Error('redis down');
      version = String(Number(version ?? 0) + 1);
    },
  };
  const instance = () => new PricingService(prisma, redis);
  return { rows, state, instance, prisma };
}

const input = (inPrice: number, outPrice = 10) => ({ model: 'gpt-4o', provider: 'OPENAI' as const, inputPricePerMillion: inPrice, outputPricePerMillion: outPrice, cachedInputPrice: 1.25 });
const priceOf = (p: PricingService) => p.requireModelPrice('gpt-4o').inputPricePerMillion;

describe('pricing consistency across instances', () => {
  it('a price change on instance A reaches instance B on its next sync tick (version bump), not before', async () => {
    const w = world();
    const a = w.instance();
    const b = w.instance();
    await a.upsertModelPrice(input(3));
    await b.syncPricingOnce(); // first tick: sees the version
    expect(priceOf(a)).toBe(3);
    expect(priceOf(b)).toBe(3);
    await a.upsertModelPrice(input(4));
    expect(priceOf(b)).toBe(3); // B has not ticked yet: still the old snapshot (by design, bounded staleness)
    expect(await b.syncPricingOnce()).toBe('refreshed');
    expect(priceOf(b)).toBe(4);
  });

  it('when the version notification is lost (Redis down), the periodic forced reload still converges', async () => {
    const w = world();
    const a = w.instance();
    const b = w.instance();
    await a.upsertModelPrice(input(3));
    await b.syncPricingOnce();
    w.state.redisUp = false;
    await expect(a.upsertModelPrice(input(5))).resolves.toBeDefined(); // the write succeeded; only the notification failed
    for (let i = 0; i < 10; i++) expect(await b.syncPricingOnce(12)).toBe('unchanged'); // ticks 2..11
    expect(priceOf(b)).toBe(3); // stale, and it knows it can only be fixed by the forced reload
    expect(b.getSyncState().redisVersionMisses).toBeGreaterThanOrEqual(10);
    expect(await b.syncPricingOnce(12)).toBe('refreshed'); // the 12th tick forces a full reload
    expect(priceOf(b)).toBe(5);
  });

  it('an older update can never overwrite a newer one in an instance cache', async () => {
    const w = world();
    const a = w.instance();
    await a.upsertModelPrice(input(3));
    await a.upsertModelPrice(input(4)); // newer row
    const newerRow = { ...[...w.rows.values()][0] };
    // simulate a lagging read replica / reordered reload delivering the OLDER row
    const olderRow = { ...newerRow, inputPricePerMillion: 3, updatedAt: new Date(newerRow.updatedAt.getTime() - 5000) };
    w.prisma.modelPricing.findMany = async () => [olderRow];
    await a.refreshPricingFromDb();
    expect(priceOf(a)).toBe(4);
  });

  it('a failed reload does NOT mark the new version as seen, so the next tick retries instead of staying stale', async () => {
    const w = world();
    const a = w.instance();
    const b = w.instance();
    await a.upsertModelPrice(input(3));
    w.state.dbUp = false;
    expect(await b.syncPricingOnce()).toBe('refreshed'); // attempted...
    expect(b.getSyncState().lastRefreshOk).toBe(false);
    expect(b.getSyncState().versionSeen).toBeNull(); // ...but not remembered
    w.state.dbUp = true;
    expect(await b.syncPricingOnce()).toBe('refreshed'); // retried on the very next tick
    expect(priceOf(b)).toBe(3);
    expect(b.getSyncState().lastRefreshOk).toBe(true);
  });

  it('a database outage keeps serving the last good prices (never an empty or default rate)', async () => {
    const w = world();
    const a = w.instance();
    await a.upsertModelPrice(input(3));
    w.state.dbUp = false;
    await a.refreshPricingFromDb();
    expect(priceOf(a)).toBe(3);
    expect(() => a.requireModelPrice('not-a-model')).toThrow();
  });

  it('a request keeps the price snapshot it reserved with, even if the price changes before it settles', async () => {
    const w = world();
    const a = w.instance();
    await a.upsertModelPrice(input(3));
    const snapshot = a.requireModelPrice('gpt-4o'); // taken at reservation time
    const reservedWith = computeCost(snapshot, 1_000_000, 0);
    await a.upsertModelPrice(input(9));
    expect(computeCost(snapshot, 1_000_000, 0)).toBe(reservedWith); // settlement uses the same snapshot
    expect(computeCost(a.requireModelPrice('gpt-4o'), 1_000_000, 0)).not.toBe(reservedWith); // the next request gets the new price
  });

  it('two instances with different cache states price the same request differently ONLY until the sync, and each is self-consistent', async () => {
    const w = world();
    const a = w.instance();
    const b = w.instance();
    await a.upsertModelPrice(input(3));
    await b.syncPricingOnce();
    await a.upsertModelPrice(input(4));
    const onA = computeCost(a.requireModelPrice('gpt-4o'), 1000, 1000);
    const onBBefore = computeCost(b.requireModelPrice('gpt-4o'), 1000, 1000);
    expect(onA).not.toBe(onBBefore);
    await b.syncPricingOnce();
    expect(computeCost(b.requireModelPrice('gpt-4o'), 1000, 1000)).toBe(onA);
  });

  it('a failed price write changes nothing anywhere (the previous price stays in force)', async () => {
    const w = world();
    const a = w.instance();
    await a.upsertModelPrice(input(3));
    w.state.dbUp = false;
    await expect(a.upsertModelPrice(input(99))).rejects.toMatchObject({ status: 503 });
    expect(priceOf(a)).toBe(3);
  });

  describe('stale-instance observability', () => {
    it('reports fresh right after a successful reload', async () => {
      const w = world();
      const a = w.instance();
      await a.refreshPricingFromDb();
      const s = a.getSyncState();
      expect(s.stale).toBe(false);
      expect(s.lastRefreshOk).toBe(true);
      expect(s.models).toBeGreaterThan(0);
    });
    it('reports stale when no reload has succeeded for longer than the threshold, and recovers after one', async () => {
      const w = world();
      const a = w.instance();
      await a.refreshPricingFromDb();
      const later = new Date(Date.now() + 10 * 60_000);
      expect(a.getSyncState(later, 300_000).stale).toBe(true);
      await a.refreshPricingFromDb();
      expect(a.getSyncState().stale).toBe(false);
    });
    it('reports stale immediately after a failed reload', async () => {
      const w = world();
      const a = w.instance();
      await a.refreshPricingFromDb();
      w.state.dbUp = false;
      await a.refreshPricingFromDb();
      expect(a.getSyncState().stale).toBe(true);
      expect(a.getSyncState().lastRefreshOk).toBe(false);
    });
    it('exposes no prices or credentials, only counts and timestamps', () => {
      const w = world();
      const s = JSON.stringify(w.instance().getSyncState());
      expect(s).not.toMatch(/inputPricePerMillion|outputPricePerMillion|sk-/);
    });
  });
});
