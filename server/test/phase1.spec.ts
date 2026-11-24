import { resolveProviderKey } from '../src/modules/gateway/adapters/provider-key.util';

const usable = (k: string) => k.startsWith('sk-');

/** Runs fn and returns the error.code of the HttpException it throws (or 'no_throw'). */
function errorCode(fn: () => unknown): string {
  try {
    fn();
    return 'no_throw';
  } catch (e: any) {
    return e.getResponse?.().error?.code ?? String(e);
  }
}

describe('Phase 1 hardening', () => {
  describe('1. Provider keys: no platform fallback', () => {
    const saved = { ...process.env };
    afterEach(() => {
      process.env = { ...saved };
    });

    it('uses the project key when present', () => {
      process.env.OPENAI_API_KEY = 'sk-platform';
      expect(resolveProviderKey('OpenAI', 'sk-tenant', 'OPENAI_API_KEY', usable)).toBe('sk-tenant');
    });

    it('never falls back to the platform key by default', () => {
      process.env.OPENAI_API_KEY = 'sk-platform';
      delete process.env.ALLOW_PLATFORM_PROVIDER_KEY;
      expect(errorCode(() => resolveProviderKey('OpenAI', undefined, 'OPENAI_API_KEY', usable))).toBe('missing_provider_key');
    });

    it('never falls back in production, even with the opt-in flag', () => {
      process.env.OPENAI_API_KEY = 'sk-platform';
      process.env.ALLOW_PLATFORM_PROVIDER_KEY = 'true';
      process.env.NODE_ENV = 'production';
      expect(errorCode(() => resolveProviderKey('OpenAI', undefined, 'OPENAI_API_KEY', usable))).toBe('missing_provider_key');
    });

    it('falls back only with the explicit dev opt-in', () => {
      process.env.OPENAI_API_KEY = 'sk-platform';
      process.env.ALLOW_PLATFORM_PROVIDER_KEY = 'true';
      process.env.NODE_ENV = 'development';
      expect(resolveProviderKey('OpenAI', undefined, 'OPENAI_API_KEY', usable)).toBe('sk-platform');
    });

    it('missing key error carries code missing_provider_key (HTTP 400)', () => {
      try {
        resolveProviderKey('OpenAI', undefined, 'OPENAI_API_KEY', usable);
        fail('expected throw');
      } catch (e: any) {
        expect(e.getStatus()).toBe(400);
        expect(e.getResponse().error.code).toBe('missing_provider_key');
      }
    });
  });
});

describe('2. Redis reconnect backoff', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { redisRetryDelayMs } = require('../src/modules/redis/redis.service');

  it('never gives up (always returns a delay) and caps at 5 s', () => {
    for (const times of [1, 5, 6, 25, 1000, 100000]) {
      const d = redisRetryDelayMs(times);
      expect(typeof d).toBe('number');
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThanOrEqual(5000);
    }
    expect(redisRetryDelayMs(1)).toBe(200);
    expect(redisRetryDelayMs(1000)).toBe(5000);
  });
});

describe('3. Unpriced models are rejected (no gpt-4o-mini fallback)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PricingService } = require('../src/modules/pricing/pricing.service');
  const pricing = new PricingService({ modelPricing: { findMany: async () => [] } }, { isConnected: false, getClient: () => null });

  it('knows catalog models and rejects unknown ones', () => {
    expect(pricing.isModelPriced('gpt-4o-mini')).toBe(true);
    expect(pricing.isModelPriced('o1-pro-imaginary')).toBe(false);
  });

  it('calculateCost throws model_not_priced for an unknown model', () => {
    expect(errorCode(() => pricing.calculateCost('o1-pro-imaginary', 1200, 400))).toBe('model_not_priced');
  });

  it('estimateMaxCost throws model_not_priced for an unknown model', () => {
    expect(errorCode(() => pricing.estimateMaxCost('o1-pro-imaginary', 1200, 400))).toBe('model_not_priced');
  });
});

describe('5. Ledger row is written before the response', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { GatewayService } = require('../src/modules/gateway/gateway.service');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PricingService } = require('../src/modules/pricing/pricing.service');

  function build(create: jest.Mock) {
    const pricing = new PricingService({ modelPricing: { findMany: async () => [] } }, { isConnected: false, getClient: () => null });
    const budget = {
      reserveCapacity: jest.fn(async (_p: string, requestId: string, amount: number) => ({
        canProceed: true, isHardBlocked: false, budgetMonthly: 10, currentMonthlySpend: 0, utilizationPct: 0,
        reservedAmount: amount, hold: { requestId, amount, buckets: [] },
      })),
      settleHold: jest.fn(async () => ({ applied: true, spend: 0.001 })),
      releaseHold: jest.fn(async () => undefined),
      markPendingPersist: jest.fn(async () => undefined),
      clearPendingPersist: jest.fn(async () => undefined),
      recordAlert: jest.fn(async () => undefined),
      evaluatePostRequestThresholds: jest.fn(async () => undefined),
    };
    const prisma = {
      providerApiKey: { findFirst: jest.fn(async () => ({ id: 'pk', encryptedKey: 'enc' })), update: jest.fn(async () => ({})) },
      project: { findUnique: jest.fn(async () => ({ id: 'p1', logRequestContent: false })) },
      request: { findMany: jest.fn(async () => []), create },
    };
    const adapter = { execute: jest.fn(async () => ({ responseText: 'hi', promptTokens: 1200, completionTokens: 400, totalTokens: 1600, isSimulated: false })) };
    const queue = { add: jest.fn(async () => ({})) };
    // Anomaly scoring is a separate durable queue now (it used to be a synchronous service call)
    const anomalyQueue = { add: jest.fn(async () => ({})) };
    const encryption = { decryptApiKey: () => 'sk-tenant' };
    const svc = new GatewayService(prisma, {}, budget, pricing, encryption, adapter, adapter, adapter, adapter, queue, anomalyQueue);
    return { svc, budget, queue };
  }
  const request = { projectId: 'p1', model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'secret prompt' }], maxTokens: 50 };

  it('does not return until the request row insert has completed', async () => {
    let finishInsert!: () => void;
    const create: jest.Mock = jest.fn((_args: any) => new Promise<void>((r) => (finishInsert = r)));
    const { svc } = build(create);
    let done = false;
    const p = svc.processChatCompletion(request).then((r: unknown) => ((done = true), r));
    for (let i = 0; i < 20 && create.mock.calls.length === 0; i++) await new Promise((r) => setImmediate(r));
    expect(create).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(done).toBe(false);
    finishInsert();
    const res = await p;
    expect(done).toBe(true);
    // ledger row id == hold id == response id
    expect(res.id).toBe(`chatcmpl-${(create.mock.calls[0] as any[])[0].data.id}`);
  });

  it('a failed insert is queued for retry with its request ID (not dropped)', async () => {
    const create: jest.Mock = jest.fn(async (_args: any) => {
      throw Object.assign(new Error('db down'), { code: 'P1001' });
    });
    const { svc, queue } = build(create);
    const res = await svc.processChatCompletion(request);
    expect(res.object).toBe('chat.completion');
    expect(queue.add).toHaveBeenCalledTimes(1);
    const [, data, opts] = queue.add.mock.calls[0] as any[];
    expect(data.id).toBe(res.id.replace('chatcmpl-', ''));
    expect(opts.jobId).toBe(data.id);
  });
});

describe('8. Per-IP gateway limit is configurable abuse protection', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { RateLimitMiddleware } = require('../src/common/middleware/rate-limit.middleware');
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  async function burst(n: number, headers: Record<string, string>) {
    const mw = new RateLimitMiddleware({ getClient: () => null }); // in-memory path
    let limited = 0;
    for (let i = 0; i < n; i++) {
      const req: any = { ip: '203.0.113.7', headers, socket: {} };
      const res: any = { setHeader: () => undefined };
      try {
        await mw.use(req, res, () => undefined);
      } catch (e: any) {
        if (e.getStatus?.() === 429) limited++;
        else throw e;
      }
    }
    return limited;
  }

  it('default: 70 keyed requests from one IP → no per-IP 429', async () => {
    delete process.env.GATEWAY_IP_RPM;
    expect(await burst(70, { authorization: 'Bearer sg_live_abc' })).toBe(0);
  });

  it('GATEWAY_IP_RPM is honoured', async () => {
    process.env.GATEWAY_IP_RPM = '50';
    expect(await burst(70, { authorization: 'Bearer sg_live_abc' })).toBe(20);
  });

  it('credential-less floods keep a tight limit (default 60/min)', async () => {
    delete process.env.GATEWAY_UNAUTH_IP_RPM;
    expect(await burst(70, {})).toBe(10);
  });
});

describe('11. Auth rate limits', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AuthRateLimitMiddleware } = require('../src/common/middleware/auth-rate-limit.middleware');

  /** Minimal Redis stand-in: multi().incr().expire().exec() */
  function fakeRedis() {
    const counts = new Map<string, number>();
    return {
      multi() {
        const ops: string[] = [];
        const chain: any = {
          incr: (k: string) => (ops.push(k), chain),
          expire: () => chain,
          exec: async () =>
            ops.flatMap((k) => {
              counts.set(k, (counts.get(k) || 0) + 1);
              return [[null, counts.get(k)], [null, 1]];
            }),
        };
        return chain;
      },
    };
  }

  async function attempts(mw: any, n: number, route: string, ip: (i: number) => string, email?: (i: number) => string) {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const req: any = { originalUrl: `/auth/${route}`, ip: ip(i), body: email ? { email: email(i) } : {}, socket: {} };
      const res: any = { setHeader: () => undefined };
      try {
        await mw.use(req, res, () => undefined);
        out.push(200);
      } catch (e: any) {
        out.push(e.getStatus());
      }
    }
    return out;
  }

  it('5 login attempts per email per minute, the 6th is 429 (even from different IPs)', async () => {
    const shared = fakeRedis();
    const mw = new AuthRateLimitMiddleware({ getClient: () => shared });
    const res = await attempts(mw, 6, 'login', (i) => `198.51.100.${i}`, () => ' Victim@Example.com ');
    expect(res).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it('10 attempts per IP per minute on reset-password, the 11th is 429', async () => {
    const shared = fakeRedis();
    const mw = new AuthRateLimitMiddleware({ getClient: () => shared });
    const res = await attempts(mw, 11, 'reset-password', () => '198.51.100.9');
    expect(res.filter((s) => s === 429)).toEqual([429]);
    expect(res[10]).toBe(429);
  });

  it('fails open when Redis is unavailable', async () => {
    const mw = new AuthRateLimitMiddleware({ getClient: () => null });
    const res = await attempts(mw, 20, 'login', () => '198.51.100.1', () => 'a@b.c');
    expect(res.every((s) => s === 200)).toBe(true);
  });
});
