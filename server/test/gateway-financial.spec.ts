import 'reflect-metadata';
import { HttpException, NotFoundException } from '@nestjs/common';
import { GatewayService } from '../src/modules/gateway/gateway.service';
import { GatewayController } from '../src/modules/gateway/gateway.controller';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { BudgetService } from '../src/modules/budget/budget.service';
import { assertProjectInOrg } from '../src/common/tenant';
import { normalizeUpstreamError } from '../src/modules/gateway/adapters/provider-http';

const redisStub: any = { isConnected: false, getClient: () => null };
const pricing = new PricingService({ modelPricing: { findMany: async () => [] } } as any, redisStub);

// ───────────────────────── GatewayService harness ─────────────────────────

function harness(opts: { adapterResult?: any; adapterError?: Error; budgetOverride?: any; ledgerFails?: boolean; ledgerQueueFails?: boolean; anomalyQueue?: 'ok' | 'rejects' | 'throws' } = {}) {
  const calls: string[] = [];
  const hold = { requestId: 'set-below', amount: 0, buckets: [] as any[] };

  const prisma: any = {
    providerApiKey: {
      findFirst: jest.fn(async () => ({ id: 'pk1', encryptedKey: 'enc' })),
      update: jest.fn(async () => ({})),
    },
    request: {
      create: jest.fn(async () => {
        calls.push('ledger.create');
        if (opts.ledgerFails) throw Object.assign(new Error('db down'), { code: 'P1001' });
        return {};
      }),
      findMany: jest.fn(async () => {
        throw new Error('the gateway hot path must not query request history');
      }),
    },
  };

  const budget: any = {
    reserveCapacity: jest.fn(async (_p: string, requestId: string, amount: number) => {
      calls.push('reserve');
      hold.requestId = requestId;
      hold.amount = amount;
      return { canProceed: true, isHardBlocked: false, budgetMonthly: 100, currentMonthlySpend: 1, utilizationPct: 1, hold, logRequestContent: false, ...opts.budgetOverride };
    }),
    settleHold: jest.fn(async () => {
      calls.push('settle');
      return { applied: true, spend: 1 };
    }),
    releaseHold: jest.fn(async () => {
      calls.push('release');
    }),
    markPendingPersist: jest.fn(async () => {
      calls.push('markPending');
    }),
    clearPendingPersist: jest.fn(async () => {
      calls.push('clearPending');
    }),
    evaluatePostRequestThresholds: jest.fn(async () => {}),
    recordAlert: jest.fn(async () => true),
  };

  const redis: any = {
    reserveTpm: jest.fn(async () => ({ allowed: true, counterKey: 'tpm-key', count: 0 })),
    adjustTpm: jest.fn(async () => {}),
  };

  const adapter: any = {
    execute: jest.fn(async () => {
      calls.push('upstream');
      if (opts.adapterError) throw opts.adapterError;
      return (
        opts.adapterResult ?? { responseText: 'Rome.', promptTokens: 100, completionTokens: 20, totalTokens: 120, isSimulated: false }
      );
    }),
  };
  const never: any = { execute: jest.fn(async () => { throw new Error('wrong adapter'); }) };

  const ledgerQueue: any = {
    add: jest.fn(async () => {
      if (opts.ledgerQueueFails) throw new Error('queue down');
      calls.push('ledgerQueue.add');
    }),
  };
  const anomalyQueue: any = {
    add: jest.fn(() => {
      calls.push('anomalyQueue.add');
      if (opts.anomalyQueue === 'throws') throw new Error('sync boom');
      return opts.anomalyQueue === 'rejects' ? Promise.reject(new Error('redis down')) : Promise.resolve({});
    }),
  };
  const encryption: any = { decryptApiKey: jest.fn(() => 'sk-test-0123456789abcdef') };

  const service = new GatewayService(prisma, redis, budget, pricing, encryption, adapter, never, never, never, ledgerQueue, anomalyQueue);
  return { service, prisma, budget, redis, adapter, ledgerQueue, anomalyQueue, hold, calls };
}

const request = (extra: any = {}) => ({
  projectId: 'proj-a',
  model: 'gpt-4o',
  messages: [{ role: 'user' as const, content: 'What is the capital of Italy? Please be brief.' }],
  maxTokens: 200,
  gatewayKey: { id: 'gk1', budgetMonthly: null, rateLimitTpm: 100000 },
  ...extra,
});

describe('gateway hot path', () => {
  it('settles with the ACTUAL provider-reported cost (cached tokens at the cached rate)', async () => {
    const h = harness({
      adapterResult: { responseText: 'ok', promptTokens: 2000, completionTokens: 100, totalTokens: 2100, isSimulated: false, cachedPromptTokens: 1500, usageEstimated: false },
    });
    const out = await h.service.processChatCompletion(request());
    const expected = pricing.calculateCost('gpt-4o', 2000, 100, { cachedTokens: 1500 });
    expect(h.budget.settleHold).toHaveBeenCalledTimes(1);
    expect(h.budget.settleHold.mock.calls[0][1]).toBe(expected);
    expect(out.governance.cost_estimate_usd).toBe(expected);
    expect(expected).toBeLessThan(pricing.calculateCost('gpt-4o', 2000, 100));
  });

  it('never queries request history on the hot path, and keeps the response shape', async () => {
    const h = harness();
    const out = await h.service.processChatCompletion(request());
    expect(h.prisma.request.findMany).not.toHaveBeenCalled();
    expect(out.governance).toMatchObject({ is_anomaly: false, anomaly_reason: null, fail_closed_active: true });
    expect(out.choices[0].message.content).toBe('Rome.');
    expect(out.usage).toEqual({ prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 });
  });

  it('queues exactly one anomaly job, keyed by request id, containing no prompt or response text', async () => {
    const h = harness();
    await h.service.processChatCompletion(request());
    expect(h.anomalyQueue.add).toHaveBeenCalledTimes(1);
    const [name, job, opts] = h.anomalyQueue.add.mock.calls[0];
    expect(name).toBe('detect-anomaly');
    expect(opts.jobId).toBe(job.requestId);
    expect(opts.attempts).toBeGreaterThan(1);
    expect(job).toMatchObject({ projectId: 'proj-a', model: 'gpt-4o', totalTokens: 120 });
    expect(JSON.stringify(job)).not.toMatch(/capital|Rome/);
  });

  it('writes the ledger row BEFORE queueing the anomaly job, and marks pending before settling', async () => {
    const h = harness();
    await h.service.processChatCompletion(request());
    expect(h.calls).toEqual(['reserve', 'upstream', 'markPending', 'settle', 'ledger.create', 'clearPending', 'anomalyQueue.add']);
  });

  it('records how the cost was derived in the ledger metadata (cached, reasoning, estimated usage, reservation)', async () => {
    const h = harness({
      adapterResult: { responseText: 'x', promptTokens: 100, completionTokens: 50, totalTokens: 150, isSimulated: false, cachedPromptTokens: 40, reasoningTokens: 30, usageEstimated: false },
    });
    await h.service.processChatCompletion(request());
    const meta = JSON.parse(h.prisma.request.create.mock.calls[0][0].data.metadataJson);
    expect(meta).toMatchObject({ cachedTokensIn: 40, reasoningTokens: 30, usageEstimated: false, holdExceeded: false });
    expect(meta.reservedUsd).toBeGreaterThan(0);
    // spike flag is set later by the worker, never invented here
    expect(h.prisma.request.create.mock.calls[0][0].data).toMatchObject({ isAnomaly: false, anomalyReason: null });
  });
});

describe('estimated reservation vs actual usage', () => {
  it('hold = prompt estimate + max_tokens at the model price (worst case, no caching assumed)', async () => {
    const h = harness();
    const r = request();
    await h.service.processChatCompletion(r);
    const promptTokens = pricing.estimateTokens(r.messages.map((m: { content: string }) => m.content).join(" "));
    expect(h.hold.amount).toBe(pricing.estimateMaxCost('gpt-4o', promptTokens, 200));
  });

  it('actual usage within max_tokens always fits the hold', async () => {
    const h = harness({ adapterResult: { responseText: 'x', promptTokens: 12, completionTokens: 200, totalTokens: 212, isSimulated: false } });
    await h.service.processChatCompletion(request());
    const meta = JSON.parse(h.prisma.request.create.mock.calls[0][0].data.metadataJson);
    expect(meta.holdExceeded).toBe(false);
  });

  it('if a provider overshoots (ignored the limit / thinking), the ACTUAL cost is settled, never the hold, and the overrun is recorded', async () => {
    const h = harness({ adapterResult: { responseText: 'x', promptTokens: 12, completionTokens: 5000, totalTokens: 5012, isSimulated: false } });
    const out = await h.service.processChatCompletion(request({ maxTokens: 200 }));
    const actual = pricing.calculateCost('gpt-4o', 12, 5000);
    expect(actual).toBeGreaterThan(h.hold.amount);
    expect(h.budget.settleHold.mock.calls[0][1]).toBe(actual); // under-charging would be the bug
    expect(out.governance.cost_estimate_usd).toBe(actual);
    const meta = JSON.parse(h.prisma.request.create.mock.calls[0][0].data.metadataJson);
    expect(meta.holdExceeded).toBe(true);
  });

  it('thinking tokens (reported inside completion tokens by the adapter) are what is charged', async () => {
    const h = harness({
      adapterResult: { responseText: 'x', promptTokens: 25, completionTokens: 315, totalTokens: 340, isSimulated: false, reasoningTokens: 312 },
    });
    await h.service.processChatCompletion(request());
    expect(h.budget.settleHold.mock.calls[0][1]).toBe(pricing.calculateCost('gpt-4o', 25, 315));
  });

  it('TPM is corrected to what was actually used', async () => {
    const h = harness();
    await h.service.processChatCompletion(request());
    const promptTokens = pricing.estimateTokens(request().messages[0].content);
    const estimated = promptTokens + 200;
    expect(h.redis.adjustTpm).toHaveBeenCalledWith('tpm-key', 120 - estimated);
  });
});

describe('failed upstream requests', () => {
  const upstream = normalizeUpstreamError({ providerLabel: 'OpenAI', status: 401, rawBody: JSON.stringify({ error: { message: 'Incorrect API key' } }) });

  it('releases the hold and the TPM reservation, charges nothing, writes no ledger row, queues no anomaly job', async () => {
    const h = harness({ adapterError: upstream });
    await expect(h.service.processChatCompletion(request())).rejects.toBe(upstream);
    expect(h.budget.releaseHold).toHaveBeenCalledTimes(1);
    expect(h.budget.releaseHold.mock.calls[0][0]).toBe(h.hold);
    expect(h.budget.settleHold).not.toHaveBeenCalled();
    expect(h.budget.markPendingPersist).not.toHaveBeenCalled();
    expect(h.redis.adjustTpm).toHaveBeenCalledTimes(1);
    expect(h.redis.adjustTpm.mock.calls[0][1]).toBeLessThan(0);
    expect(h.prisma.request.create).not.toHaveBeenCalled();
    expect(h.anomalyQueue.add).not.toHaveBeenCalled();
  });

  it('a provider auth failure surfaces as 502 upstream_auth_failed, not as a SpendGuard 401', async () => {
    const h = harness({ adapterError: upstream });
    const e = await h.service.processChatCompletion(request()).catch((x) => x as HttpException);
    expect((e as HttpException).getStatus()).toBe(502);
    expect(((e as HttpException).getResponse() as any).error.code).toBe('upstream_auth_failed');
  });

  it('an unexpected (non-HTTP) adapter crash also releases the hold', async () => {
    const h = harness({ adapterError: new TypeError('boom') });
    await expect(h.service.processChatCompletion(request())).rejects.toThrow('boom');
    expect(h.budget.releaseHold).toHaveBeenCalledTimes(1);
    expect(h.budget.settleHold).not.toHaveBeenCalled();
  });
});

describe('ledger persistence failure', () => {
  it('the charge stands, the row is queued for retry, pending stays marked, and the client still gets its answer', async () => {
    const h = harness({ ledgerFails: true });
    const out = await h.service.processChatCompletion(request());
    expect(out.choices[0].message.content).toBe('Rome.');
    expect(h.budget.markPendingPersist).toHaveBeenCalledTimes(1);
    expect(h.budget.settleHold).toHaveBeenCalledTimes(1);
    expect(h.ledgerQueue.add).toHaveBeenCalledTimes(1);
    const [, job, opts] = h.ledgerQueue.add.mock.calls[0];
    expect(opts.jobId).toBe(job.id);
    expect(opts.attempts).toBeGreaterThanOrEqual(10);
    // not cleared: reconciliation must keep the charge until the row lands
    expect(h.budget.clearPendingPersist).not.toHaveBeenCalled();
  });

  it('even if the retry queue is down too, the request succeeds (CRITICAL is logged, spend stays pending)', async () => {
    const h = harness({ ledgerFails: true, ledgerQueueFails: true });
    await expect(h.service.processChatCompletion(request())).resolves.toBeDefined();
    expect(h.budget.clearPendingPersist).not.toHaveBeenCalled();
  });
});

describe('notification and anomaly failures never affect enforcement', () => {
  it.each(['rejects', 'throws'] as const)('anomaly queue %s: response, settlement and ledger are unchanged', async (mode) => {
    const h = harness({ anomalyQueue: mode });
    const out = await h.service.processChatCompletion(request());
    expect(out.choices[0].message.content).toBe('Rome.');
    expect(h.budget.settleHold).toHaveBeenCalledTimes(1);
    expect(h.prisma.request.create).toHaveBeenCalledTimes(1);
    expect(h.budget.clearPendingPersist).toHaveBeenCalledTimes(1);
  });

  it('a failing alert dispatch cannot turn a hard block into an allow (BudgetService fails closed regardless)', async () => {
    const redisFake: any = {
      projectMonthBucket: () => ({ name: 'project_monthly', spendKey: 's', holdsKey: 'h', holdsExpKey: 'e', cap: 10, keyTtlSec: 100 }),
      keyMonthBucket: () => ({ name: 'key_monthly', spendKey: 'ks', holdsKey: 'kh', holdsExpKey: 'ke', cap: null, keyTtlSec: 100 }),
      // spend already at the cap: the reservation is rejected
      reserveHold: jest.fn(async () => ({ status: 'rejected', failedBucket: { name: 'project_monthly', cap: 10 }, spend: 10, held: 0 })),
    };
    const prismaFake: any = {
      project: {
        findUnique: jest.fn(async () => ({ id: 'p', name: 'P', isBlocked: false, budgetMonthly: 10, budgetHardBlockEnabled: true, logRequestContent: false })),
        update: jest.fn(async () => ({})),
      },
    };
    const dispatch: any = { dispatch: jest.fn(async () => { throw new Error('slack queue exploded'); }) };
    const budget = new BudgetService(prismaFake, redisFake, dispatch);
    const res = await budget.reserveCapacity('p', 'req_1', 1);
    expect(dispatch.dispatch).toHaveBeenCalled(); // it tried to alert...
    expect(res.canProceed).toBe(false); // ...and the block still holds
    expect(res.isHardBlocked).toBe(true);
    expect(prismaFake.project.update).toHaveBeenCalled();
  });
});

describe('pre-flight rejections spend nothing', () => {
  it('an unpriced model is rejected 400 before any hold or upstream call', async () => {
    const h = harness();
    const e = await h.service.processChatCompletion(request({ model: 'gpt-4o-2099-snapshot' })).catch((x) => x as HttpException);
    expect((e as HttpException).getStatus()).toBe(400);
    expect(((e as HttpException).getResponse() as any).error.code).toBe('model_not_priced');
    expect(h.budget.reserveCapacity).not.toHaveBeenCalled();
    expect(h.adapter.execute).not.toHaveBeenCalled();
  });

  it('a budget block never reaches the provider and logs a blocked row', async () => {
    const h = harness({ budgetOverride: { canProceed: false, isHardBlocked: true, blockReason: 'Budget Cap Exceeded: x', hold: undefined } });
    const e = await h.service.processChatCompletion(request()).catch((x) => x as HttpException);
    expect((e as HttpException).getStatus()).toBe(429);
    expect(h.adapter.execute).not.toHaveBeenCalled();
    expect(h.redis.adjustTpm).toHaveBeenCalled(); // TPM admission released
  });
});

// ───────────────────────── Cross-tenant isolation (controller) ─────────────────────────

describe('cross-tenant isolation at the gateway', () => {
  const PROJECTS = [
    { id: 'proj-a', orgId: 'org-a' },
    { id: 'proj-b', orgId: 'org-b' },
  ];
  const makeController = (gwKey: any | null = null) => {
    const processChatCompletion = jest.fn(async () => ({ headers: {}, id: 'x' }));
    const prisma: any = {
      gatewayApiKey: {
        findUnique: jest.fn(async () => gwKey),
        update: jest.fn(async () => ({})),
      },
      // evaluates the org filter like Postgres would
      project: { findFirst: jest.fn(async ({ where }: any) => PROJECTS.find((p) => p.id === where.id && p.orgId === where.orgId) ?? null) },
    };
    const encryption: any = { hashToken: (t: string) => `hash(${t})` };
    const auth: any = { verifyAccessToken: jest.fn(async (t: string) => (t === 'jwt-org-a' ? { id: 'user-a', orgId: 'org-a' } : null)) };
    const redis: any = { getClient: () => null };
    const controller = new GatewayController({ processChatCompletion } as any, prisma, encryption, pricing, redis, auth);
    return { controller, processChatCompletion, prisma };
  };
  const res = () => {
    const r: any = { setHeader: jest.fn(), status: jest.fn(() => r), json: jest.fn() };
    return r;
  };
  const httpReq: any = { ip: '1.2.3.4', socket: {}, headers: { 'user-agent': 'jest' } };
  const body = (extra: any = {}) => ({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }], ...extra });
  const call = (c: GatewayController, b: any, bearer: string) => c.createChatCompletion(b, `Bearer ${bearer}`, '', '', '', httpReq, res());
  const validKey = { id: 'gk-a', projectId: 'proj-a', isActive: true, expiresAt: null, allowedModels: null, allowedProviders: null, rateLimitRpm: 0, rateLimitTpm: null, budgetMonthly: null };

  it("org A's gateway key bills project A even when the body names project B (the key decides the project)", async () => {
    const { controller, processChatCompletion } = makeController(validKey);
    await call(controller, body({ projectId: 'proj-b', project_id: 'proj-b', userId: 'victim' }), 'sg_live_aaaa');
    const arg = (processChatCompletion.mock.calls[0] as any[])[0];
    expect(arg.projectId).toBe('proj-a');
    expect(arg.userId).toBeUndefined(); // body userId is never trusted
  });

  it("org A's dashboard session cannot use org B's project: 404 and the service is never called", async () => {
    const { controller, processChatCompletion } = makeController();
    const e = await call(controller, body({ projectId: 'proj-b' }), 'jwt-org-a').catch((x) => x as HttpException);
    expect((e as HttpException).getStatus()).toBe(404);
    expect(((e as HttpException).getResponse() as any).error.code).toBe('project_not_found');
    expect(processChatCompletion).not.toHaveBeenCalled();
  });

  it("org A's dashboard session can use its own project", async () => {
    const { controller, processChatCompletion } = makeController();
    await call(controller, body({ projectId: 'proj-a' }), 'jwt-org-a');
    expect((processChatCompletion.mock.calls[0] as any[])[0]).toMatchObject({ projectId: 'proj-a', userId: 'user-a' });
  });

  it('a project header alone is not authentication, and a forged JWT is a SpendGuard 401', async () => {
    const { controller, processChatCompletion } = makeController();
    const forged = await call(controller, body({ projectId: 'proj-a' }), 'jwt-forged').catch((x) => x as HttpException);
    expect((forged as HttpException).getStatus()).toBe(401);
    const none = await controller.createChatCompletion(body(), '', '', 'proj-a', 'proj-a', httpReq, res()).catch((x) => x as HttpException);
    expect((none as HttpException).getStatus()).toBe(401);
    expect(processChatCompletion).not.toHaveBeenCalled();
  });

  it.each([
    ['revoked', { ...validKey, isActive: false }],
    ['expired', { ...validKey, expiresAt: new Date(Date.now() - 1000) }],
    ['unknown', null],
  ])('a %s gateway key is 401 and reaches nothing', async (_n, key) => {
    const { controller, processChatCompletion } = makeController(key as any);
    const e = await call(controller, body(), 'sg_live_x').catch((x) => x as HttpException);
    expect((e as HttpException).getStatus()).toBe(401);
    expect(processChatCompletion).not.toHaveBeenCalled();
  });

  it("the key's model allowlist is enforced (403), and an unpriced model is a 400, both before any hold", async () => {
    const restricted = makeController({ ...validKey, allowedModels: JSON.stringify(['gpt-4o-mini']) });
    const denied = await call(restricted.controller, body({ model: 'gpt-4o' }), 'sg_live_x').catch((x) => x as HttpException);
    expect((denied as HttpException).getStatus()).toBe(403);
    const open = makeController(validKey);
    const unpriced = await call(open.controller, body({ model: 'not-a-priced-model' }), 'sg_live_x').catch((x) => x as HttpException);
    expect((unpriced as HttpException).getStatus()).toBe(400);
    expect(restricted.processChatCompletion).not.toHaveBeenCalled();
    expect(open.processChatCompletion).not.toHaveBeenCalled();
  });

  it('assertProjectInOrg: another tenant\'s project id is indistinguishable from a missing one (404)', async () => {
    const prisma: any = { project: { findFirst: jest.fn(async ({ where }: any) => PROJECTS.find((p) => p.id === where.id && p.orgId === where.orgId) ?? null) } };
    await expect(assertProjectInOrg(prisma, 'proj-b', 'org-a')).rejects.toBeInstanceOf(NotFoundException);
    await expect(assertProjectInOrg(prisma, 'does-not-exist', 'org-a')).rejects.toBeInstanceOf(NotFoundException);
    await expect(assertProjectInOrg(prisma, 'proj-a', 'org-a')).resolves.toMatchObject({ id: 'proj-a' });
  });
});
