import 'reflect-metadata';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { HttpException } from '@nestjs/common';
import { RedisService } from '../src/modules/redis/redis.service';
import { BudgetService } from '../src/modules/budget/budget.service';
import { GatewayService } from '../src/modules/gateway/gateway.service';
import { PricingService } from '../src/modules/pricing/pricing.service';

/**
 * What the budget cap does and does NOT guarantee, proven against the real Redis Lua engine through the
 * real GatewayService. Gated on TEST_REDIS_PORT like budget-redis.spec.ts (throwaway Redis only).
 *
 *  1. Estimates hold   -> spend NEVER exceeds the cap, however many requests race.
 *  2. Estimates break  -> spend exceeds the cap by AT MOST the reported overruns, and the next request is blocked.
 */
const PORT = process.env.TEST_REDIS_PORT ? Number(process.env.TEST_REDIS_PORT) : 0;
const HOST = process.env.TEST_REDIS_HOST || '127.0.0.1';
(PORT ? describe : describe.skip)('budget enforcement against real Redis (cap vs reservations)', () => {
  const config: any = { get: (k: string) => ({ 'redis.host': HOST, 'redis.port': PORT }[k]) };
  const pricing = new PricingService({ modelPricing: { findMany: async () => [] } } as any, { getCache: async () => null } as any);
  const messages = [{ role: 'user' as const, content: 'Summarise the quarterly spend report in two sentences.' }];
  const MAX = 100;
  const hold = pricing.estimateMaxCost('gpt-4o', pricing.estimateReservationTokens('OPENAI', messages), MAX);

  let redis: RedisService;
  let raw: Redis;
  const created: string[] = [];

  beforeAll(async () => {
    redis = new RedisService(config);
    await redis.onModuleInit();
    for (let i = 0; i < 50 && !redis.isConnected; i++) await new Promise((r) => setTimeout(r, 50));
    raw = new Redis({ host: HOST, port: PORT });
  });
  afterAll(async () => {
    for (const id of created) {
      const keys = await raw.keys(`*${id}*`);
      if (keys.length) await raw.del(...keys);
    }
    await raw.quit();
    await redis.onModuleDestroy();
  });

  /** A project with its own cap, a real BudgetService and GatewayService over real Redis. */
  function build(capUsd: number, providerBehaviour: (i: number) => { completionTokens: number } | Error) {
    const projectId = `enf-${randomUUID()}`;
    created.push(projectId);
    const project = { id: projectId, name: projectId, isBlocked: false, blockReason: null as string | null, budgetMonthly: capUsd, budgetHardBlockEnabled: true, logRequestContent: false };
    const prisma: any = {
      project: {
        findUnique: jest.fn(async () => ({ ...project })),
        update: jest.fn(async ({ data }: any) => Object.assign(project, data)),
      },
      providerApiKey: { findFirst: async () => ({ id: 'k', encryptedKey: 'e' }), update: async () => ({}) },
      request: { create: jest.fn(async () => ({})), findMany: jest.fn() },
      requestAttempt: { create: jest.fn(async () => ({})) },
    };
    const budget = new BudgetService(prisma, redis, { dispatch: jest.fn(async () => ({ status: 'IN_APP' })) } as any);
    let n = 0;
    const adapter: any = {
      execute: jest.fn(async () => {
        const out = providerBehaviour(n++);
        await new Promise((r) => setTimeout(r, 5 + Math.random() * 10)); // keep requests overlapping
        if (out instanceof Error) throw out;
        return { responseText: 'ok', promptTokens: 10, completionTokens: out.completionTokens, totalTokens: 10 + out.completionTokens, isSimulated: false };
      }),
    };
    const q: any = { add: jest.fn(async () => ({})) };
    const svc = new GatewayService(prisma, redis, budget, pricing, { decryptApiKey: () => 'sk-test-0123456789abcdef' } as any, adapter, adapter, adapter, adapter, q, q);
    const call = () => svc.processChatCompletion({ projectId, orgId: 'org', model: 'gpt-4o', messages, maxTokens: MAX });
    const spend = async () => (await redis.getProjectSpend(projectId)) ?? -1;
    const held = async () => {
      const b = redis.projectMonthBucket(projectId, null);
      return (await raw.hvals(b.holdsKey)).reduce((a, v) => a + Number(v), 0);
    };
    return { call, spend, held, project, prisma };
  }
  const settle = (results: PromiseSettledResult<any>[]) => ({
    ok: results.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled'),
    blocked: results.filter((r) => r.status === 'rejected' && (r.reason as HttpException).getStatus?.() === 429),
    failed: results.filter((r) => r.status === 'rejected' && (r.reason as HttpException).getStatus?.() !== 429),
  });

  it('ESTIMATES HOLD: 60 racing requests against a cap worth 8 reservations → exactly 8 succeed and spend NEVER exceeds the cap', async () => {
    const cap = hold * 8.5;
    const t = build(cap, () => ({ completionTokens: MAX })); // every request uses its full output allowance, no more
    const { ok, blocked } = settle(await Promise.allSettled(Array.from({ length: 60 }, () => t.call())));
    expect(ok).toHaveLength(8);
    expect(blocked).toHaveLength(52);
    expect(ok.every((r) => r.value.governance.reservation.overrun_usd === 0)).toBe(true);
    expect(await t.spend()).toBeLessThanOrEqual(cap);
    expect(await t.held()).toBe(0); // nothing leaked
  });

  it('ESTIMATES BREAK: spend exceeds the cap by at most the overruns that were REPORTED, and the very next request is blocked', async () => {
    const cap = hold * 4.5;
    // each provider reply is far bigger than its reservation (e.g. a provider that ignored the output limit)
    const t = build(cap, () => ({ completionTokens: MAX * 6 }));
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => t.call()));
    const { ok } = settle(results);
    expect(ok.length).toBeGreaterThan(0);
    const totalOverrun = ok.reduce((a, r) => a + r.value.governance.reservation.overrun_usd, 0);
    const spend = await t.spend();

    expect(totalOverrun).toBeGreaterThan(0);
    expect(spend).toBeGreaterThan(cap); // the cap is on reservations, so it CAN be exceeded...
    // ...but never by more than what the gateway told the callers it overran
    const reservedTotal = ok.reduce((a, r) => a + r.value.governance.reservation.reserved_usd, 0);
    expect(spend).toBeCloseTo(reservedTotal + totalOverrun, 4);
    expect(spend - cap).toBeLessThanOrEqual(totalOverrun + 1e-6);
    expect(await t.held()).toBe(0);

    // once settled spend is over the cap the project is frozen: no further spend is possible
    const next = await t.call().catch((e) => e as HttpException);
    expect((next as HttpException).getStatus()).toBe(429);
    expect(t.project.isBlocked).toBe(true);
    expect(t.project.blockReason).toMatch(/Budget Cap Exceeded/);
    expect(await t.spend()).toBe(spend); // and nothing more was charged
  });

  it('FAILED UPSTREAM under concurrency: failures release their holds, charge nothing, and leave capacity for the rest', async () => {
    const cap = hold * 6.5;
    const boom = normalizedError();
    const t = build(cap, (i) => (i % 2 === 0 ? boom : { completionTokens: MAX }));
    const { ok, failed, blocked } = settle(await Promise.allSettled(Array.from({ length: 40 }, () => t.call())));
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((r) => (r as PromiseRejectedResult).reason === boom)).toBe(true);
    // spend is exactly the successful requests; never more than the cap; no hold left behind
    const spend = await t.spend();
    expect(spend).toBeCloseTo(ok.reduce((a, r) => a + r.value.governance.cost_estimate_usd, 0), 4);
    expect(spend).toBeLessThanOrEqual(cap);
    expect(await t.held()).toBe(0);
    expect(ok.length + failed.length + blocked.length).toBe(40);
    // failed calls were audited without spend
    expect(t.prisma.requestAttempt.create).toHaveBeenCalledTimes(failed.length);
  });

  it('a reservation released after a failure really frees the capacity for the next caller', async () => {
    const cap = hold * 1.5; // room for exactly one reservation
    const boom = normalizedError();
    const t = build(cap, (i) => (i === 0 ? boom : { completionTokens: MAX }));
    await expect(t.call()).rejects.toBe(boom);
    expect(await t.held()).toBe(0);
    await expect(t.call()).resolves.toBeDefined(); // would be 429 if the failed call had leaked its hold
  });

  it('two projects share nothing: exhausting one leaves the other untouched', async () => {
    const a = build(hold * 1.5, () => ({ completionTokens: MAX }));
    const b = build(hold * 1.5, () => ({ completionTokens: MAX }));
    await a.call();
    const blockedA = await a.call().catch((e) => e as HttpException);
    expect((blockedA as HttpException).getStatus()).toBe(429);
    await expect(b.call()).resolves.toBeDefined();
    expect(await b.spend()).toBeGreaterThan(0);
  });
});

function normalizedError() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { normalizeUpstreamError } = require('../src/modules/gateway/adapters/provider-http');
  return normalizeUpstreamError({ providerLabel: 'OpenAI', status: 500, rawBody: '{}' }) as HttpException;
}
