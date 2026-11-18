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
