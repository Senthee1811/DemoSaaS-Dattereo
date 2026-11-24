import 'reflect-metadata';
import { HttpException } from '@nestjs/common';
import { OpenAIAdapter } from '../../src/modules/gateway/adapters/openai.adapter';
import { AnthropicAdapter } from '../../src/modules/gateway/adapters/anthropic.adapter';
import { GeminiAdapter } from '../../src/modules/gateway/adapters/gemini.adapter';
import { GroqAdapter } from '../../src/modules/gateway/adapters/groq.adapter';
import { PricingService, computeCost } from '../../src/modules/pricing/pricing.service';

/**
 * LIVE provider contract tests. These spend REAL money (a few cents at most) and talk to the real providers.
 *
 *   - They never run in `npm test` or CI: the file is not a *.spec.ts. Run them on purpose:
 *       LIVE_PROVIDER_TESTS=1 LIVE_OPENAI_API_KEY=... npm run test:providers:live
 *   - A provider is exercised only if LIVE_PROVIDER_TESTS=1 AND its own key variable is set. Otherwise it is reported as
 *     NOT RUN. NOT RUN is not PASS, and nothing here claims compatibility for a provider that was not run.
 *   - Cost is bounded: each provider makes at most 2 billable calls with max 16 output tokens and a trivial prompt
 *     (the auth-failure and invalid-model checks are rejected by the provider and cost nothing).
 *   - Keys are read from the environment, never printed, never written anywhere.
 *   - Models can be overridden with LIVE_<PROVIDER>_MODEL when a default has been retired.
 *   - Results are printed as a table at the end, one row per provider and check.
 */
const ENABLED = process.env.LIVE_PROVIDER_TESTS === '1';
const redis: any = { isConnected: false, getClient: () => null };
const pricing = new PricingService({ modelPricing: { findMany: async () => [] } } as any, redis);

interface Target {
  name: string;
  keyVar: string;
  model: string;
  adapter: () => { execute: (req: any, key?: string) => Promise<any> };
  badKey: string;
}
const TARGETS: Target[] = [
  { name: 'OpenAI', keyVar: 'LIVE_OPENAI_API_KEY', model: process.env.LIVE_OPENAI_MODEL || 'gpt-4o-mini', adapter: () => new OpenAIAdapter(pricing), badKey: 'sk-proj-invalidinvalidinvalidinvalidinvalid0000' },
  { name: 'Anthropic', keyVar: 'LIVE_ANTHROPIC_API_KEY', model: process.env.LIVE_ANTHROPIC_MODEL || 'claude-haiku-5-5', adapter: () => new AnthropicAdapter(pricing), badKey: 'sk-ant-api03-invalidinvalidinvalidinvalid0000' },
  { name: 'Gemini', keyVar: 'LIVE_GEMINI_API_KEY', model: process.env.LIVE_GEMINI_MODEL || 'gemini-3.5-flash-lite', adapter: () => new GeminiAdapter(pricing), badKey: 'AIzaSyInvalidInvalidInvalidInvalidInvalid00' },
  { name: 'Groq', keyVar: 'LIVE_GROQ_API_KEY', model: process.env.LIVE_GROQ_MODEL || 'openai/gpt-oss-120b', adapter: () => new GroqAdapter(pricing), badKey: 'gsk_invalidinvalidinvalidinvalidinvalid0000' },
];

const results: Array<{ provider: string; check: string; status: 'PASS' | 'FAIL' | 'NOT RUN'; detail?: string }> = [];
const record = (provider: string, check: string, status: 'PASS' | 'FAIL' | 'NOT RUN', detail?: string) => results.push({ provider, check, status, detail });
const req = (model: string, extra: any = {}) => ({ projectId: 'live-test', model, messages: [{ role: 'user', content: 'Reply with the single word OK.' }], maxTokens: 16, ...extra });
const errorOf = async (fn: () => Promise<unknown>) => (await fn().then(() => null, (e) => e)) as HttpException | null;

afterAll(() => {
  // eslint-disable-next-line no-console
  console.log('\nLIVE PROVIDER RESULTS\n' + results.map((r) => `${r.status.padEnd(8)} ${r.provider.padEnd(10)} ${r.check}${r.detail ? `  (${r.detail})` : ''}`).join('\n'));
});

describe('live provider contracts', () => {
  if (!ENABLED) {
    it('NOT RUN: set LIVE_PROVIDER_TESTS=1 (and a LIVE_<PROVIDER>_API_KEY) to run these against the real providers', () => {
      for (const t of TARGETS) record(t.name, 'all checks', 'NOT RUN', 'LIVE_PROVIDER_TESTS is not 1');
    });
    return;
  }

  for (const t of TARGETS) {
    const key = process.env[t.keyVar];
    if (!key) {
      it(`${t.name}: NOT RUN (${t.keyVar} is not set)`, () => {
        record(t.name, 'all checks', 'NOT RUN', `${t.keyVar} not set`);
      });
      continue;
    }
    const check = (name: string, fn: () => Promise<void>) =>
      it(`${t.name}: ${name}`, async () => {
        try {
          await fn();
          record(t.name, name, 'PASS');
        } catch (e: any) {
          record(t.name, name, 'FAIL', String(e?.message ?? e).split('\n')[0].slice(0, 160).split(key).join('[key]'));
          throw e;
        }
      }, 60_000);

    check('a real completion returns text and PROVIDER-REPORTED usage, priced above zero', async () => {
      const r = await t.adapter().execute(req(t.model), key);
      expect(r.responseText.length).toBeGreaterThan(0);
      expect(r.usageEstimated).toBe(false); // the provider reported usage; if this fails, our parsing no longer matches
      expect(r.promptTokens).toBeGreaterThan(0);
      expect(r.completionTokens).toBeGreaterThan(0);
      expect(r.totalTokens).toBe(r.promptTokens + r.completionTokens);
      expect(computeCost(pricing.requireModelPrice(t.model), r.promptTokens, r.completionTokens)).toBeGreaterThan(0);
      expect(['stop', 'length', 'content_filter', 'tool_calls']).toContain(r.finishReason);
    });

    check('the output limit and a system message are accepted', async () => {
      const r = await t.adapter().execute(req(t.model, { messages: [{ role: 'system', content: 'Answer in one word.' }, { role: 'user', content: 'Name any colour.' }], maxTokens: 16 }), key);
      expect(r.responseText.length).toBeGreaterThan(0);
      // output is bounded by the limit we sent (providers may count hidden reasoning inside it)
      expect(r.completionTokens).toBeLessThanOrEqual(16 + 8);
    });

    check('a rejected provider key is a 502 upstream_auth_failed, not a SpendGuard 401', async () => {
      const e = await errorOf(() => t.adapter().execute(req(t.model), t.badKey));
      expect(e).not.toBeNull();
      expect(e!.getStatus()).toBe(502);
      expect((e!.getResponse() as any).error.code).toBe('upstream_auth_failed');
    });

    check('an unknown model is rejected by the provider with a client-class error (and costs nothing)', async () => {
      const e = await errorOf(() => t.adapter().execute(req('definitely-not-a-real-model-name-xyz'), key));
      expect(e).not.toBeNull();
      expect([400, 404, 502]).toContain(e!.getStatus());
      expect(JSON.stringify(e!.getResponse())).not.toContain(key);
    });
  }
});
