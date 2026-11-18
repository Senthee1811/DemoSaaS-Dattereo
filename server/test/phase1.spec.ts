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
    const anomaly = { detectSpike: () => ({ isAnomaly: false, score: 0 }) };
    const encryption = { decryptApiKey: () => 'sk-tenant' };
    const svc = new GatewayService(prisma, {}, budget, pricing, anomaly, encryption, adapter, adapter, adapter, queue);
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
