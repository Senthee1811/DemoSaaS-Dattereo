import 'reflect-metadata';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { HttpException } from '@nestjs/common';
import { RedisService } from '../src/modules/redis/redis.service';
import { BudgetService } from '../src/modules/budget/budget.service';
import { GatewayService } from '../src/modules/gateway/gateway.service';
import { PricingService } from '../src/modules/pricing/pricing.service';

/**
 * Money-path tests against a REAL Redis (the Lua scripts are the product, a mock would prove nothing).
 *
 * They only run when TEST_REDIS_PORT is set (CI sets it; locally point it at a THROWAWAY Redis,
 * e.g. `docker run -d -p 127.0.0.1:6391:6379 redis:7-alpine`, never at a dev instance). All keys are
 * namespaced by random project/request ids and only those keys are deleted afterwards.
 */
const PORT = process.env.TEST_REDIS_PORT ? Number(process.env.TEST_REDIS_PORT) : 0;
const HOST = process.env.TEST_REDIS_HOST || '127.0.0.1';
const withRedis = PORT ? describe : describe.skip;
if (!PORT) console.warn('[budget-redis.spec] TEST_REDIS_PORT not set: the real-Redis suites are SKIPPED');

const config: any = { get: (k: string) => ({ 'redis.host': HOST, 'redis.port': PORT }[k]) };
const pricing = new PricingService({ modelPricing: { findMany: async () => [] } } as any, { isConnected: false, getClient: () => null } as any);

async function connectedRedis(): Promise<RedisService> {
  const svc = new RedisService(config);
  await svc.onModuleInit();
  for (let i = 0; i < 50 && !svc.isConnected; i++) await new Promise((r) => setTimeout(r, 50));
  if (!svc.isConnected) throw new Error(`test Redis not reachable at ${HOST}:${PORT}`);
  return svc;
}

const runId = randomUUID();
const ids: string[] = [];
const newId = (label: string) => {
  const id = `${label}-${runId}-${ids.length}`;
  ids.push(id);
  return id;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function budgetServiceFor(redis: RedisService, project: any, prismaExtra: any = {}) {
  const prisma: any = {
    project: {
      findUnique: jest.fn(async () => project),
      update: jest.fn(async () => ({})),
    },
    ...prismaExtra,
  };
  const dispatch: any = { dispatch: jest.fn(async () => ({ status: 'IN_APP' })) };
  return { budget: new BudgetService(prisma, redis, dispatch), prisma, dispatch };
}

const projectRow = (id: string, budgetMonthly: number, extra: any = {}) => ({
  id, name: id, isBlocked: false, budgetMonthly, budgetHardBlockEnabled: true, logRequestContent: false, ...extra,
});

withRedis('budget holds against real Redis', () => {
  let redis: RedisService;
  let raw: Redis;

  beforeAll(async () => {
    redis = await connectedRedis();
    raw = new Redis({ host: HOST, port: PORT });
  });

  afterAll(async () => {
    // delete only the keys this run created
    const keys = new Set<string>();
    for (const id of ids) {
      let cursor = '0';
      do {
        const [next, found] = await raw.scan(cursor, 'MATCH', `*${id}*`, 'COUNT', 500);
        cursor = next;
        found.forEach((k) => keys.add(k));
      } while (cursor !== '0');
    }
    if (keys.size) await raw.del(...keys);
    await raw.quit();
    await redis.onModuleDestroy();
  });

  const spendOf = async (projectId: string) => (await redis.getProjectSpend(projectId)) ?? -1;
  const heldOf = async (b: ReturnType<RedisService['projectMonthBucket']>) =>
    (await raw.hvals(b.holdsKey)).reduce((a, v) => a + Number(v), 0);

  describe('concurrent reservation races', () => {
    it('50 parallel reservations against a $1.00 cap admit exactly 8 x $0.125, never more', async () => {
      const p = newId('race');
      const bucket = redis.projectMonthBucket(p, 1.0);
      const results = await Promise.all(Array.from({ length: 50 }, (_, i) => redis.reserveHold(`req_${p}_${i}`, 0.125, [bucket])));
      expect(results.every((r) => r !== null)).toBe(true);
      const reserved = results.filter((r) => r!.status === 'reserved').length;
      expect(reserved).toBe(8);
      expect(results.filter((r) => r!.status === 'rejected').length).toBe(42);
      expect(await heldOf(bucket)).toBeCloseTo(1.0, 9);
    });

    it('through BudgetService.reserveCapacity: 40 parallel requests, budget $1.00, worst case $0.125 → exactly 8 proceed', async () => {
      const p = newId('svc-race');
      const { budget } = budgetServiceFor(redis, projectRow(p, 1.0));
      const out = await Promise.all(Array.from({ length: 40 }, (_, i) => budget.reserveCapacity(p, `req_${p}_${i}`, 0.125)));
      expect(out.filter((r) => r.canProceed).length).toBe(8);
      // rejected ones left nothing behind
      expect(await heldOf(redis.projectMonthBucket(p, 1.0))).toBeCloseTo(1.0, 9);
    });

    it('a key cap below the project cap binds, and a rejected request leaves NO partial hold in the project bucket', async () => {
      const p = newId('keyrace');
      const key = newId('gk');
      const projectBucket = redis.projectMonthBucket(p, 1.0);
      const keyBucket = redis.keyMonthBucket(key, 0.5);
      const results = await Promise.all(
        Array.from({ length: 30 }, (_, i) => redis.reserveHold(`req_${p}_${i}`, 0.125, [projectBucket, keyBucket])),
      );
      expect(results.filter((r) => r!.status === 'reserved').length).toBe(4); // 0.5 / 0.125
      const rejected = results.filter((r) => r!.status === 'rejected');
      expect(rejected.every((r) => r!.failedBucket?.name === 'key_monthly')).toBe(true);
      // all-or-nothing across buckets: project holds equal key holds
      expect(await heldOf(projectBucket)).toBeCloseTo(0.5, 9);
      expect(await heldOf(keyBucket)).toBeCloseTo(0.5, 9);
    });

    it('re-reserving the same request id is a no-op (duplicate), not a second hold', async () => {
      const p = newId('dup-reserve');
      const bucket = redis.projectMonthBucket(p, 1.0);
      const a = await redis.reserveHold(`req_${p}`, 0.25, [bucket]);
      const b = await redis.reserveHold(`req_${p}`, 0.25, [bucket]);
      expect(a!.status).toBe('reserved');
      expect(b!.status).toBe('duplicate');
      expect(await heldOf(bucket)).toBeCloseTo(0.25, 9);
    });
  });

  describe('idempotent settlement and release', () => {
    it('settling the same request 5 times in parallel charges its cost exactly once', async () => {
      const p = newId('dup-settle');
      const bucket = redis.projectMonthBucket(p, 10);
      await redis.reserveHold(`req_${p}`, 0.5, [bucket]);
      const res = await Promise.all(Array.from({ length: 5 }, () => redis.settleHold(`req_${p}`, 0.3, [bucket])));
      expect(res.filter((r) => r!.applied).length).toBe(1);
      expect(await spendOf(p)).toBeCloseTo(0.3, 9);
      expect(await heldOf(bucket)).toBe(0);
    });

    it('settle charges the ACTUAL cost (lower than the hold), and frees the unused part of the hold', async () => {
      const p = newId('actual');
      const bucket = redis.projectMonthBucket(p, 1.0);
      await redis.reserveHold(`req_${p}_1`, 0.5, [bucket]);
      await redis.settleHold(`req_${p}_1`, 0.1, [bucket]);
      expect(await spendOf(p)).toBeCloseTo(0.1, 9);
      // 0.9 is free again: a 0.875 hold now fits
      const next = await redis.reserveHold(`req_${p}_2`, 0.875, [bucket]);
      expect(next!.status).toBe('reserved');
    });

    it('settle on an over-hold actual cost still charges everything (soft overage is never under-charged)', async () => {
      const p = newId('overshoot');
      const bucket = redis.projectMonthBucket(p, 1.0);
      await redis.reserveHold(`req_${p}`, 0.1, [bucket]);
      await redis.settleHold(`req_${p}`, 0.4, [bucket]);
      expect(await spendOf(p)).toBeCloseTo(0.4, 9);
    });

    it('release frees the hold with no charge, twice is the same as once', async () => {
      const p = newId('release');
      const bucket = redis.projectMonthBucket(p, 1.0);
      await redis.reserveHold(`req_${p}`, 1.0, [bucket]);
      expect((await redis.reserveHold(`req_${p}_other`, 0.125, [bucket]))!.status).toBe('rejected');
      await redis.releaseHold(`req_${p}`, [bucket]);
      await redis.releaseHold(`req_${p}`, [bucket]);
      expect(await spendOf(p)).toBe(0);
      expect(await heldOf(bucket)).toBe(0);
      expect((await redis.reserveHold(`req_${p}_other`, 0.125, [bucket]))!.status).toBe('reserved');
    });

    it('settle AFTER release charges nothing; release AFTER settle refunds nothing', async () => {
      const p = newId('order');
      const bucket = redis.projectMonthBucket(p, 10);
      await redis.reserveHold(`req_${p}_a`, 0.5, [bucket]);
      await redis.releaseHold(`req_${p}_a`, [bucket]);
      const late = await redis.settleHold(`req_${p}_a`, 0.3, [bucket]);
      expect(late!.applied).toBe(false);

      await redis.reserveHold(`req_${p}_b`, 0.5, [bucket]);
      await redis.settleHold(`req_${p}_b`, 0.3, [bucket]);
      await redis.releaseHold(`req_${p}_b`, [bucket]);
      expect(await spendOf(p)).toBeCloseTo(0.3, 9);
    });

    it('settle charges every bucket (project and key) the same actual amount', async () => {
      const p = newId('multi');
      const key = newId('gk-multi');
      const pb = redis.projectMonthBucket(p, 10);
      const kb = redis.keyMonthBucket(key, 5);
      await redis.reserveHold(`req_${p}`, 0.5, [pb, kb]);
      await redis.settleHold(`req_${p}`, 0.25, [pb, kb]);
      expect(Number(await raw.get(pb.spendKey))).toBeCloseTo(0.25, 9);
      expect(Number(await raw.get(kb.spendKey))).toBeCloseTo(0.25, 9);
    });

    it('a hold leaked by a crash expires on its own and stops blocking others', async () => {
      const p = newId('expiry');
      const bucket = redis.projectMonthBucket(p, 1.0);
      await redis.reserveHold(`req_${p}_leak`, 1.0, [bucket], 80); // 80 ms TTL
      expect((await redis.reserveHold(`req_${p}_x`, 0.125, [bucket]))!.status).toBe('rejected');
      await sleep(200);
      expect((await redis.reserveHold(`req_${p}_x`, 0.125, [bucket]))!.status).toBe('reserved');
    });
  });

  describe('tenant isolation in the budget engine', () => {
    it("filling project A's cap does not touch project B, and a key's bucket is its own", async () => {
      const a = newId('tenant-a');
      const b = newId('tenant-b');
      const ba = redis.projectMonthBucket(a, 0.25);
      const bb = redis.projectMonthBucket(b, 0.25);
      expect((await redis.reserveHold(`req_${a}_1`, 0.25, [ba]))!.status).toBe('reserved');
      expect((await redis.reserveHold(`req_${a}_2`, 0.125, [ba]))!.status).toBe('rejected');
      expect((await redis.reserveHold(`req_${b}_1`, 0.25, [bb]))!.status).toBe('reserved');
      await redis.settleHold(`req_${a}_1`, 0.25, [ba]);
      expect(await spendOf(a)).toBeCloseTo(0.25, 9);
      expect(await spendOf(b)).toBe(0);
      expect(ba.spendKey).not.toBe(bb.spendKey);
    });
  });

  describe('Redis outage mid-request', () => {
    it('settlement fails while Redis is gone: the client is still answered, the ledger row is written, and reconciliation repairs spend', async () => {
      const p = newId('midflight');
      const live = await connectedRedis();
      const { budget } = budgetServiceFor(live, projectRow(p, 10), {});
      const created: any[] = [];
      const prisma: any = {
        providerApiKey: { findFirst: async () => ({ id: 'k', encryptedKey: 'e' }), update: async () => ({}) },
        request: { create: jest.fn(async ({ data }: any) => { created.push(data); return {}; }), findMany: async () => [] },
      };
      const adapter: any = {
        // Redis dies during the provider call
        execute: jest.fn(async () => {
          (live as any).client.disconnect();
          await sleep(50);
          return { responseText: 'ok', promptTokens: 1000, completionTokens: 100, totalTokens: 1100, isSimulated: false };
        }),
      };
      const never: any = { execute: async () => { throw new Error('wrong adapter'); } };
      const q: any = { add: jest.fn(async () => ({})) };
      const enc: any = { decryptApiKey: () => 'sk-test-0123456789abcdef' };
      const svc = new GatewayService(prisma, live as any, budget, pricing, enc, adapter, never, never, never, q, q);

      const out = await svc.processChatCompletion({ projectId: p, model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 });
      expect(out.usage.total_tokens).toBe(1100);
      expect(created).toHaveLength(1); // the row is in the ledger even though Redis could not settle
      const cost = pricing.calculateCost('gpt-4o', 1000, 100);

      // Redis "comes back" (a fresh connection): the hold expires / spend is rebuilt from the ledger
      const back = await connectedRedis();
      const { budget: after } = budgetServiceFor(back, projectRow(p, 10), {
        request: { aggregate: async () => ({ _sum: { costEstimate: cost } }), groupBy: async () => [] },
        gatewayApiKey: { findMany: async () => [] },
      });
      // the failed settle left its hold; expire it the way TTL would
      await raw.del(back.projectMonthBucket(p, null).holdsKey, back.projectMonthBucket(p, null).holdsExpKey);
      await after.reconcileProjectSpend(p);
      expect(await back.getProjectSpend(p)).toBeCloseTo(cost, 6);
      await back.onModuleDestroy();
    });
  });

  describe('delayed ledger persistence and reconciliation', () => {
    const reconcileWith = async (p: string, ledgerSum: number | (() => Promise<number>), extra: any = {}) => {
      const { budget, prisma } = budgetServiceFor(redis, projectRow(p, 100), {
        request: {
          aggregate: jest.fn(async () => ({ _sum: { costEstimate: typeof ledgerSum === 'function' ? await ledgerSum() : ledgerSum } })),
          groupBy: jest.fn(async () => []),
        },
        gatewayApiKey: { findMany: jest.fn(async () => []) },
        ...extra,
      });
      await budget.reconcileProjectSpend(p);
      return prisma;
    };
    const settleOne = async (p: string, requestId: string, cost: number, at = new Date()) => {
      const bucket = redis.projectMonthBucket(p, 100);
      await redis.reserveHold(requestId, cost, [bucket]);
      await redis.markPendingPersist(p, requestId, at);
      await redis.settleHold(requestId, cost, [bucket]);
      return at;
    };

    it('settled but ledger row NOT yet written: reconciliation must not lower spend; once it lands, spend matches the ledger', async () => {
      const p = newId('delay');
      const at = await settleOne(p, `req_${p}`, 0.4);
      await reconcileWith(p, 0); // DB has nothing yet
      expect(await spendOf(p)).toBeCloseTo(0.4, 9); // kept: the charge is pending persistence

      await redis.clearPendingPersist(p, `req_${p}`, at); // the (retried) row lands
      await reconcileWith(p, 0.4);
      expect(await spendOf(p)).toBeCloseTo(0.4, 9);
    });

    it('an in-flight hold also blocks lowering', async () => {
      const p = newId('inflight');
      const bucket = redis.projectMonthBucket(p, 100);
      await redis.reserveHold(`req_${p}_live`, 0.2, [bucket]);
      await raw.set(bucket.spendKey, '0.9'); // counter ahead of the ledger
      await reconcileWith(p, 0.4);
      expect(await spendOf(p)).toBeCloseTo(0.9, 9); // not lowered while something is in flight
    });

    it('ledger activity between reading the sequence and reading the DB blocks lowering (the race the guard exists for)', async () => {
      const p = newId('seq');
      const bucket = redis.projectMonthBucket(p, 100);
      await raw.set(bucket.spendKey, '0.9');
      await reconcileWith(p, async () => {
        // a request settles + persists while reconciliation is aggregating
        await settleOne(p, `req_${p}_concurrent`, 0.1);
        await redis.clearPendingPersist(p, `req_${p}_concurrent`, new Date());
        return 0.4; // the DB read predates that row
      });
      expect(await spendOf(p)).toBeGreaterThanOrEqual(0.9); // never dropped below what was already charged
    });

    it('idle and drifted high: reconciliation lowers the counter to the ledger sum', async () => {
      const p = newId('drift');
      const bucket = redis.projectMonthBucket(p, 100);
      await raw.set(bucket.spendKey, '0.9');
      await reconcileWith(p, 0.4);
      expect(await spendOf(p)).toBeCloseTo(0.4, 9);
    });

    it('a Redis flush (counter lost) is repaired up to the ledger sum', async () => {
      const p = newId('flush');
      await raw.del(redis.projectMonthBucket(p, 100).spendKey);
      await reconcileWith(p, 0.75);
      expect(await spendOf(p)).toBeCloseTo(0.75, 9);
    });

    it('blocked rows are excluded from the ledger sum used for spend', async () => {
      const p = newId('blocked-rows');
      const prisma = await reconcileWith(p, 0.1);
      expect(prisma.request.aggregate.mock.calls[0][0].where).toMatchObject({ projectId: p, isBlocked: false });
    });
  });

  describe('alert deduplication primitive', () => {
    it('20 parallel claims of the same key: exactly one wins; it can be claimed again after the TTL', async () => {
      const key = `spendguard:test-claim:${newId('claim')}`;
      const results = await Promise.all(Array.from({ length: 20 }, () => redis.acquireOnce(key, 1)));
      expect(results.filter((r) => r === true)).toHaveLength(1);
      expect(results.filter((r) => r === false)).toHaveLength(19);
      await sleep(1200);
      expect(await redis.acquireOnce(key, 1)).toBe(true);
    });
  });
});

// ───────────────── Redis down: needs no server, always runs ─────────────────

describe('Redis outage fails closed', () => {
  const downRedis = () => new RedisService({ get: () => undefined } as any); // never initialised: getClient() === null

  it('RedisService reports unavailable (null/false), never an invented success', async () => {
    const r = downRedis();
    expect(r.isConnected).toBe(false);
    expect(await r.reserveHold('req', 1, [r.projectMonthBucket('p', 10)])).toBeNull();
    expect(await r.settleHold('req', 1, [r.projectMonthBucket('p', 10)])).toBeNull();
    expect(await r.releaseHold('req', [r.projectMonthBucket('p', 10)])).toBe(false);
    expect(await r.acquireOnce('k', 10)).toBeNull();
    expect(await r.reserveTpm('k', 10, 100)).toBeNull();
  });

  it('BudgetService.reserveCapacity blocks with governance_unavailable (never allows)', async () => {
    const { budget } = budgetServiceFor(downRedis(), projectRow('p', 100));
    const res = await budget.reserveCapacity('p', 'req_1', 0.01);
    expect(res.canProceed).toBe(false);
    expect(res.isHardBlocked).toBe(true);
    expect(res.blockReason).toContain('Governance engine unavailable');
    expect(res.hold).toBeUndefined();
  });

  it('the gateway answers 503 governance_unavailable and NEVER calls the provider while Redis is down', async () => {
    const { budget } = budgetServiceFor(downRedis(), projectRow('p', 100));
    const adapter: any = { execute: jest.fn() };
    const prisma: any = { request: { create: jest.fn(async () => ({})) } };
    const redis: any = { reserveTpm: async () => null, adjustTpm: async () => {} };
    const q: any = { add: jest.fn() };
    const svc = new GatewayService(prisma, redis, budget, pricing, {} as any, adapter, adapter, adapter, adapter, q, q);
    const e = (await svc
      .processChatCompletion({ projectId: 'p', model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }], maxTokens: 10, gatewayKey: { id: 'gk', budgetMonthly: null, rateLimitTpm: 1000 } })
      .catch((x) => x)) as HttpException;
    expect(e.getStatus()).toBe(503);
    expect((e.getResponse() as any).error.code).toBe('governance_unavailable');
    expect(adapter.execute).not.toHaveBeenCalled();
    expect(q.add).not.toHaveBeenCalled();
  });

  it('reconciliation skips (does not zero the counter) when Redis is unavailable', async () => {
    const aggregate = jest.fn(async () => ({ _sum: { costEstimate: 0 } }));
    const { budget } = budgetServiceFor(downRedis(), projectRow('p', 100), { request: { aggregate, groupBy: jest.fn() }, gatewayApiKey: { findMany: jest.fn() } });
    await expect(budget.reconcileProjectSpend('p')).resolves.toBeUndefined();
    expect(aggregate).not.toHaveBeenCalled();
  });
});
