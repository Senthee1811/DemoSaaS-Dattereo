import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from '../src/modules/redis/redis.service';
import { BudgetService } from '../src/modules/budget/budget.service';
import { GatewayService } from '../src/modules/gateway/gateway.service';
import { PricingService } from '../src/modules/pricing/pricing.service';

/**
 * Redis dies at each point of a gateway request's life. REAL Redis (the Lua scripts are the product); the connection is
 * cut with ioredis' own disconnect() exactly where each scenario says. Gated like budget-redis.spec.ts: set
 * TEST_REDIS_PORT to a THROWAWAY Redis.
 *
 * For every scenario the invariants are the same:
 *   - the caller gets the provider's answer or the provider's error, never an internal Redis error
 *   - a charge that happened is in the LEDGER exactly once (or its journal line exists), a failure writes none
 *   - nothing is settled twice, nothing is released twice into a refund
 *   - once Redis is back, reconciliation makes the spend counter equal the ledger sum (never above, never below)
 *   - unsafe admission never happens: no budget decision is made while Redis state cannot be trusted
 */
const PORT = process.env.TEST_REDIS_PORT ? Number(process.env.TEST_REDIS_PORT) : 0;
const HOST = process.env.TEST_REDIS_HOST || '127.0.0.1';
const withRedis = PORT ? describe : describe.skip;
if (!PORT) console.warn('[redis-interruption.spec] TEST_REDIS_PORT not set: the real-Redis suite is SKIPPED');

const config: any = { get: (k: string) => ({ 'redis.host': HOST, 'redis.port': PORT }[k]) };
const pricing = new PricingService({ modelPricing: { findMany: async () => [] } } as any, { isConnected: false, getClient: () => null } as any);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const USAGE = { responseText: 'ok', promptTokens: 1000, completionTokens: 100, totalTokens: 1100, isSimulated: false };
const COST = pricing.calculateCost('gpt-4o', 1000, 100);
const SECRET_PROMPT = 'TOP-SECRET-PROMPT-TEXT-12345';

async function connected(): Promise<RedisService> {
  const svc = new RedisService(config);
  await svc.onModuleInit();
  for (let i = 0; i < 60 && !svc.isConnected; i++) await sleep(50);
  if (!svc.isConnected) throw new Error(`test Redis not reachable at ${HOST}:${PORT}`);
  return svc;
}
const cut = (svc: RedisService) => (svc as any).client.disconnect();

withRedis('Redis interruption across the request lifecycle', () => {
  let raw: Redis;
  const created: string[] = [];
  const services: RedisService[] = [];

  beforeAll(async () => {
    raw = new Redis({ host: HOST, port: PORT });
  });
  afterAll(async () => {
    for (const id of created) {
      let cursor = '0';
      do {
        const [next, found] = await raw.scan(cursor, 'MATCH', `*${id}*`, 'COUNT', 500);
        cursor = next;
        if (found.length) await raw.del(...found);
      } while (cursor !== '0');
    }
    await raw.quit();
    await Promise.all(services.map((s) => s.onModuleDestroy().catch(() => undefined)));
  });
  afterEach(() => {
    delete process.env.BUDGET_HOLD_TTL_MS;
    jest.restoreAllMocks();
  });

  const live = async () => {
    const s = await connected();
    services.push(s);
    return s;
  };

  /** One gateway wired to a real RedisService and an in-memory ledger. */
  async function flow(opts: { adapter: (ctx: { live: RedisService }) => Promise<any>; ledgerFails?: boolean; queueFails?: boolean; budget?: number }) {
    const projectId = `intr-${randomUUID()}`;
    created.push(projectId);
    const redis = await live();
    const ledger: any[] = [];
    const attempts: any[] = [];
    const prisma: any = {
      providerApiKey: { findFirst: async () => ({ id: 'k', encryptedKey: 'e' }), update: async () => ({}) },
      project: { findUnique: jest.fn(async () => ({ id: projectId, name: projectId, isBlocked: false, budgetMonthly: opts.budget ?? 10, budgetHardBlockEnabled: true, logRequestContent: false, orgId: 'org' })), update: async () => ({}) },
      request: {
        create: jest.fn(async ({ data }: any) => {
          if (opts.ledgerFails) throw Object.assign(new Error('db down'), { code: 'P1001' });
          ledger.push(data);
          return {};
        }),
        findMany: async () => [],
        aggregate: async () => ({ _sum: { costEstimate: ledger.reduce((a, r) => a + r.costEstimate, 0) } }),
        groupBy: async () => [],
      },
      requestAttempt: { create: jest.fn(async ({ data }: any) => (attempts.push(data), {})) },
      gatewayApiKey: { findMany: async () => [] },
    };
    const dispatch: any = { dispatch: jest.fn(async () => ({})) };
    const budget = new BudgetService(prisma, redis, dispatch);
    const adapter: any = { execute: jest.fn(() => opts.adapter({ live: redis })) };
    const never: any = { execute: async () => { throw new Error('wrong adapter'); } };
    const ledgerQueue: any = { add: jest.fn(async () => { if (opts.queueFails) throw new Error('queue down (redis)'); return {}; }) };
    const anomalyQueue: any = { add: jest.fn(async () => ({})) };
    const svc = new GatewayService(prisma, redis as any, budget, pricing, { decryptApiKey: () => 'sk-test-0123456789abcdef' } as any, adapter, never, never, never, ledgerQueue, anomalyQueue);
    const call = () => svc.processChatCompletion({ projectId, model: 'gpt-4o', messages: [{ role: 'user', content: `${SECRET_PROMPT} hello` }], maxTokens: 100, orgId: 'org' });
    return { projectId, redis, ledger, attempts, prisma, budget, svc, call, adapter, ledgerQueue, anomalyQueue };
  }

  /** Redis comes back (new connection): rebuild spend from the ledger the way the scheduled job does. */
  async function recover(f: Awaited<ReturnType<typeof flow>>) {
    const back = await live();
    const budget = new BudgetService(f.prisma, back, { dispatch: jest.fn() } as any);
    // a hold leaked by the dead request is cleared by TTL in production; make that deterministic here
    const b = back.projectMonthBucket(f.projectId, null);
    await raw.del(b.holdsKey, b.holdsExpKey);
    await budget.reconcileProjectSpend(f.projectId);
    return { back, budget };
  }
  // Refusals are recorded as BLOCKED rows (cost 0, never spend); only non-blocked rows are charges
  const charges = (f: { ledger: any[] }) => f.ledger.filter((r) => !r.isBlocked);
  const ledgerSum = (f: { ledger: any[] }) => charges(f).reduce((a, r) => a + r.costEstimate, 0);

  it('1. BEFORE reservation: governance_unavailable (503), the provider is never called, nothing is written, nothing is admitted', async () => {
    const f = await flow({ adapter: async () => USAGE });
    cut(f.redis);
    await sleep(30);
    const e = (await f.call().catch((x) => x)) as HttpException;
    expect(e.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect((e.getResponse() as any).error.code).toBe('governance_unavailable');
    expect(f.adapter.execute).not.toHaveBeenCalled();
    expect(charges(f)).toHaveLength(0); // the refusal is audited as a blocked row with cost 0, never as spend
    expect(f.ledger.every((r) => r.isBlocked === true && r.costEstimate === 0)).toBe(true);
    // and it never "falls open": still blocked on the next attempt
    expect(((await f.call().catch((x) => x)) as HttpException).getStatus()).toBe(503);
  });

  it('2. IMMEDIATELY AFTER reservation: the request completes, is charged once in the ledger, and recovery matches spend to the ledger', async () => {
    const f = await flow({ adapter: async () => USAGE });
    const real = f.redis.reserveHold.bind(f.redis);
    jest.spyOn(f.redis, 'reserveHold').mockImplementation(async (...a: Parameters<typeof real>) => {
      const r = await real(...a);
      cut(f.redis); // dies the instant the hold is placed
      await sleep(30);
      return r;
    });
    const out = await f.call();
    expect(out.usage.total_tokens).toBe(1100);
    expect(f.ledger).toHaveLength(1);
    expect(f.ledger[0].costEstimate).toBeCloseTo(COST, 9);
    expect(f.ledger[0].usageStatus).toBe('CONFIRMED');
    const { back } = await recover(f);
    expect(await back.getProjectSpend(f.projectId)).toBeCloseTo(ledgerSum(f), 9); // not 0 (lost), not 2x (double)
  });

  it('3. DURING provider execution, provider SUCCEEDS: settled by reconciliation from the single ledger row, never twice', async () => {
    const f = await flow({ adapter: async ({ live: l }) => (cut(l), await sleep(40), USAGE) });
    const out = await f.call();
    expect(out.usage.total_tokens).toBe(1100);
    expect(f.ledger).toHaveLength(1);
    const { back } = await recover(f);
    expect(await back.getProjectSpend(f.projectId)).toBeCloseTo(COST, 9);
    // reconciling again is stable (idempotent)
    await new BudgetService(f.prisma, back, { dispatch: jest.fn() } as any).reconcileProjectSpend(f.projectId);
    expect(await back.getProjectSpend(f.projectId)).toBeCloseTo(COST, 9);
  });

  it('3b. DURING provider execution, provider FAILS: the caller gets the provider error, no charge is recorded, the leaked hold expires by itself', async () => {
    process.env.BUDGET_HOLD_TTL_MS = '700';
    const f = await flow({
      budget: 0.05,
      adapter: async ({ live: l }) => {
        cut(l);
        await sleep(30);
        throw new HttpException({ error: { message: 'upstream down', code: 'upstream_server_error', upstream_status: 503 } }, HttpStatus.BAD_GATEWAY);
      },
    });
    const e = (await f.call().catch((x) => x)) as HttpException;
    expect(e.getStatus()).toBe(502); // the provider's failure, not a Redis error
    expect(f.ledger).toHaveLength(0);
    expect(f.attempts).toHaveLength(1);
    expect(f.attempts[0]).toMatchObject({ errorClass: 'upstream_server_error', executionStatus: 'PROVIDER_ERROR', billingStatus: 'UNCERTAIN' });
    // The release could not run, so the hold is still counted: capacity is temporarily reduced (safe direction)…
    const back = await live();
    const b = back.projectMonthBucket(f.projectId, 0.05);
    const blocked = await back.reserveHold(`req_${f.projectId}_probe`, 0.0499, [b]); // fits the cap only if the leaked hold is gone
    expect(blocked?.status).toBe('rejected');
    // …and returns by itself once the hold's TTL passes, with no charge ever recorded
    await sleep(900);
    const freed = await back.reserveHold(`req_${f.projectId}_probe2`, 0.0499, [b]);
    expect(freed?.status).toBe('reserved');
    expect(await back.getProjectSpend(f.projectId)).toBe(0);
  });

  it('4. AFTER the provider answered, BEFORE settlement: the charge is in the ledger and spend recovers to exactly that charge', async () => {
    const f = await flow({ adapter: async ({ live: l }) => { const r = USAGE; cut(l); await sleep(30); return r; } });
    const markPending = jest.spyOn(f.redis, 'markPendingPersist');
    const out = await f.call();
    expect(out.id).toMatch(/^chatcmpl-req_/);
    expect(markPending).toHaveBeenCalled(); // attempted; it degraded instead of throwing
    expect(f.ledger).toHaveLength(1);
    const { back } = await recover(f);
    expect(await back.getProjectSpend(f.projectId)).toBeCloseTo(ledgerSum(f), 9);
  });

  it('4b. settling the same request twice (a duplicate) charges once; release after settle refunds nothing', async () => {
    const redis = await live();
    const p = `intr-${randomUUID()}`;
    created.push(p);
    const bucket = redis.projectMonthBucket(p, 10);
    const id = `req_${p}`;
    await redis.reserveHold(id, 0.5, [bucket]);
    const [a, b] = await Promise.all([redis.settleHold(id, 0.3, [bucket]), redis.settleHold(id, 0.3, [bucket])]);
    expect([a!.applied, b!.applied].filter(Boolean)).toHaveLength(1);
    await redis.releaseHold(id, [bucket]);
    await redis.releaseHold(id, [bucket]);
    expect(await redis.getProjectSpend(p)).toBeCloseTo(0.3, 9);
  });

  it('5. DURING ledger persistence: the DB write fails while Redis is down and the retry queue (Redis) is down too: the charge survives as a journal line with NO content', async () => {
    const lines: string[] = [];
    jest.spyOn(Logger.prototype, 'error').mockImplementation((m: any) => void lines.push(String(m)));
    const f = await flow({ ledgerFails: true, queueFails: true, adapter: async ({ live: l }) => (cut(l), await sleep(30), USAGE) });
    const out = await f.call();
    expect(out.usage.total_tokens).toBe(1100); // the caller still gets what they paid for
    const journal = lines.find((l) => l.includes('LEDGER_JOURNAL'));
    expect(journal).toBeDefined();
    const row = JSON.parse(journal!.slice(journal!.indexOf('LEDGER_JOURNAL') + 'LEDGER_JOURNAL'.length));
    expect(row).toMatchObject({ projectId: f.projectId, provider: 'OPENAI', model: 'gpt-4o', tokensIn: 1000, tokensOut: 100, usageStatus: 'CONFIRMED' });
    expect(row.costUsd).toBeCloseTo(COST, 9);
    expect(row.id).toMatch(/^req_/);
    expect(lines.join('\n')).not.toContain(SECRET_PROMPT); // financial fields only
  });

  it('5b. the DB write fails but the queue works: the row is queued for retry (and not lost)', async () => {
    const f = await flow({ ledgerFails: true, adapter: async () => USAGE });
    await f.call();
    expect(f.ledgerQueue.add).toHaveBeenCalledTimes(1);
    expect((f.ledgerQueue.add.mock.calls[0] as any[])[1]).toMatchObject({ id: expect.stringMatching(/^req_/), costEstimate: expect.any(Number) });
  });

  it('6. ANOMALY job creation fails: the response and the ledger are unaffected (the row stays PENDING for the recovery sweep)', async () => {
    const f = await flow({ adapter: async () => USAGE });
    f.anomalyQueue.add.mockRejectedValue(new Error('redis down'));
    const out = await f.call();
    expect(out.governance.anomaly.status).toBe('pending');
    expect(f.ledger[0].anomalyStatus).toBe('PENDING');
  });

  it('7. Redis DATA LOSS (flush, connection alive) mid-flight: the request is charged from the actual cost and reconciliation rebuilds the counter from the ledger', async () => {
    const f = await flow({ adapter: async () => { await raw.del(...(await raw.keys(`*${f.projectId}*`))); return USAGE; } });
    const out = await f.call();
    expect(out.usage.total_tokens).toBe(1100);
    expect(f.ledger).toHaveLength(1);
    const budget = new BudgetService(f.prisma, f.redis, { dispatch: jest.fn() } as any);
    await budget.reconcileProjectSpend(f.projectId);
    expect(await f.redis.getProjectSpend(f.projectId)).toBeCloseTo(ledgerSum(f), 9);
  });

  it('8. N parallel requests while Redis is cut part-way: every request either completes (one ledger row) or is refused (no row); spend after recovery equals the ledger', async () => {
    const f = await flow({ budget: 100, adapter: async () => { await sleep(20); return USAGE; } });
    const results = await Promise.all(
      Array.from({ length: 12 }, async (_, i) => {
        if (i === 6) cut(f.redis);
        await sleep(i * 5);
        return f.call().then(() => 'ok', (e) => ((e as HttpException).getStatus() === 503 ? 'refused' : `other:${(e as HttpException).getStatus?.()}`));
      }),
    );
    expect(results.every((r) => r === 'ok' || r === 'refused')).toBe(true);
    expect(charges(f)).toHaveLength(results.filter((r) => r === 'ok').length); // exactly one charge row per completed request
    expect(new Set(f.ledger.map((r) => r.id)).size).toBe(f.ledger.length); // no duplicate settlement/persist
    const { back } = await recover(f);
    expect(await back.getProjectSpend(f.projectId)).toBeCloseTo(ledgerSum(f), 9);
  });
});
