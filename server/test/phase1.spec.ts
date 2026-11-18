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
