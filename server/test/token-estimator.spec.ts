import 'reflect-metadata';
import { getEncoding } from 'js-tiktoken';
import {
  estimateTextTokens,
  estimateChatTokens,
  estimateReservationPromptTokens,
  providerEstimateMargin,
  outputReserveTokens,
  TOKENS_PER_MESSAGE,
  TOKENS_REPLY_PRIMER,
} from '../src/modules/pricing/token-estimator';
import { PricingService } from '../src/modules/pricing/pricing.service';

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

/**
 * Ground truth: OpenAI's real BPE tokenizers (offline, via js-tiktoken). Anthropic's and Gemini's
 * tokenizers are not available offline, so for them only documented properties are tested (margins).
 */
const o200k = getEncoding('o200k_base');
const cl100k = getEncoding('cl100k_base');

const CORPORA: Record<string, string> = {
  prose: 'The quick brown fox jumps over the lazy dog. Financial governance requires that every request be attributed to a project, a key and a model. '.repeat(20),
  code: `export async function reserveHold(requestId: string, amount: number, buckets: BudgetBucket[]): Promise<HoldReservation | null> {\n  const keys = buckets.flatMap((b) => [b.spendKey, b.holdsKey, b.holdsExpKey]);\n  if (!client) return null; // fail closed\n  const res: any = await client.eval(RESERVE_HOLD_LUA, keys.length, ...keys);\n}\n`.repeat(12),
  json: JSON.stringify(Array.from({ length: 60 }, (_, i) => ({ id: 'req_' + i * 7919, cost: (i * 0.000137).toFixed(6), tokens: 1000 + i, ok: i % 2 === 0, ts: '2026-11-24T06:12:28.192Z' }))),
  chinese: '这是一个关于人工智能支出治理的测试句子，用来衡量令牌估算的准确性。'.repeat(25),
  japanese: 'これは人工知能の支出管理に関するテスト文です。トークン推定の精度を測定します。'.repeat(25),
  arabic: 'هذا اختبار لقياس دقة تقدير الرموز في نظام حوكمة الإنفاق على الذكاء الاصطناعي.'.repeat(20),
  emoji: '🚀💸🔥✅😀👩‍💻🇺🇸 '.repeat(60),
  digits: '3141592653589793238462643383279502884197169399375105820974944592307816406286'.repeat(10),
  base64: Buffer.from(Array.from({ length: 1500 }, (_, i) => (i * 131) % 256)).toString('base64'),
  uuids: Array.from({ length: 40 }, (_, i) => `550e8400-e29b-41d4-a716-${(446655440000 + i).toString(16).padStart(12, '0')}`).join(' '),
  urls: 'https://api.example.com/v1/projects/proj_9f3a1c/keys?cursor=eyJpZCI6MTIzfQ&limit=50&sort=created_at '.repeat(20),
  mixed: 'Hello 世界! The total is $1,234.56 (approx.) — see https://x.io/a?b=1 😀 '.repeat(25),
  accents: 'Dépêchez-vous, le café est déjà prêt à côté de la façade. Überprüfung der Straßenführung. '.repeat(20),
};

const legacy = (t: string) => Math.max(1, Math.ceil(t.length / 4)); // the old characters/4 rule

describe('the old characters/4 estimate (root cause)', () => {
  it('under-counts real OpenAI tokens by 2-3x for JSON, CJK, emoji and base64', () => {
    for (const k of ['json', 'chinese', 'japanese', 'emoji', 'base64']) {
      const actual = Math.min(o200k.encode(CORPORA[k]).length, cl100k.encode(CORPORA[k]).length) || 1;
      expect(legacy(CORPORA[k]) / actual).toBeLessThan(0.75); // short by more than a quarter
    }
  });
});

describe('the class-aware estimator against real tokenizers', () => {
  it.each(Object.keys(CORPORA))('%s: estimate is at least the real o200k_base AND cl100k_base token count', (k) => {
    const est = estimateTextTokens(CORPORA[k]);
    expect(est).toBeGreaterThanOrEqual(o200k.encode(CORPORA[k]).length);
    expect(est).toBeGreaterThanOrEqual(cl100k.encode(CORPORA[k]).length);
  });

  it('does not wildly over-reserve plain English (stays under 1.6x), which would cause needless 429s near a cap', () => {
    expect(estimateTextTokens(CORPORA.prose) / o200k.encode(CORPORA.prose).length).toBeLessThan(1.6);
    expect(estimateTextTokens(CORPORA.code) / o200k.encode(CORPORA.code).length).toBeLessThan(1.6);
    expect(estimateTextTokens(CORPORA.json) / o200k.encode(CORPORA.json).length).toBeLessThan(1.6);
  });

  it('empty text is 0, any non-empty text is at least 1', () => {
    expect(estimateTextTokens('')).toBe(0);
    expect(estimateTextTokens('a')).toBe(1);
    expect(estimateTextTokens(undefined as any)).toBe(0);
  });

  it('is linear-time on large input (a 2 MB prompt does not stall the request path)', () => {
    const started = Date.now();
    estimateTextTokens('lorem ipsum dolor 1234 世界 '.repeat(80_000));
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('chat framing: a few tokens per message plus the reply primer', () => {
    const msgs = [{ content: 'hello' }, { content: 'world' }];
    expect(estimateChatTokens(msgs)).toBe(TOKENS_REPLY_PRIMER + 2 * TOKENS_PER_MESSAGE + estimateTextTokens('hello') + estimateTextTokens('world'));
    expect(estimateChatTokens([])).toBe(TOKENS_REPLY_PRIMER);
  });

  it('real chat prompts: the reservation (with margin) covers the real count for every corpus, even for Gemini and Groq defaults', () => {
    for (const k of Object.keys(CORPORA)) {
      const msgs = [{ content: 'You are a careful assistant.' }, { content: CORPORA[k] }];
      const actual = Math.max(o200k.encode(msgs[0].content + CORPORA[k]).length, cl100k.encode(msgs[0].content + CORPORA[k]).length) + 3 * msgs.length + 3; // generous framing allowance
      for (const p of ['OPENAI', 'GROQ', 'GEMINI', 'ANTHROPIC'] as const) {
        expect(estimateReservationPromptTokens(p, msgs)).toBeGreaterThanOrEqual(actual);
      }
    }
  });
});

describe('provider margins', () => {
  it('defaults: OpenAI/Groq small, Gemini moderate, Anthropic >= the documented +30% tokenizer difference', () => {
    expect(providerEstimateMargin('OPENAI')).toBe(1.1);
    expect(providerEstimateMargin('GROQ')).toBe(1.1);
    expect(providerEstimateMargin('GEMINI')).toBe(1.25);
    expect(providerEstimateMargin('ANTHROPIC')).toBeGreaterThanOrEqual(1.3); // Anthropic: "approximately 30 percent more tokens" on 4.7+ tokenizers
  });

  it('is overridable per provider; values below 1 or garbage are ignored (a margin may never shrink the hold)', () => {
    process.env.GATEWAY_ESTIMATE_MARGIN_ANTHROPIC = '1.8';
    expect(providerEstimateMargin('ANTHROPIC')).toBe(1.8);
    process.env.GATEWAY_ESTIMATE_MARGIN_ANTHROPIC = '0.5';
    expect(providerEstimateMargin('ANTHROPIC')).toBe(1.4);
    process.env.GATEWAY_ESTIMATE_MARGIN_ANTHROPIC = 'abc';
    expect(providerEstimateMargin('ANTHROPIC')).toBe(1.4);
  });

  it('the same prompt reserves more for Anthropic than for OpenAI', () => {
    const msgs = [{ content: CORPORA.prose }];
    expect(estimateReservationPromptTokens('ANTHROPIC', msgs)).toBeGreaterThan(estimateReservationPromptTokens('OPENAI', msgs));
  });

  it('Gemini thinking reserve defaults to 0 (trust maxOutputTokens) and is opt-in; other providers never get one', () => {
    expect(outputReserveTokens('GEMINI')).toBe(0);
    process.env.GATEWAY_GEMINI_THINKING_RESERVE_TOKENS = '2048';
    expect(outputReserveTokens('GEMINI')).toBe(2048);
    expect(outputReserveTokens('OPENAI')).toBe(0);
    expect(outputReserveTokens('ANTHROPIC')).toBe(0);
    process.env.GATEWAY_GEMINI_THINKING_RESERVE_TOKENS = '-5';
    expect(outputReserveTokens('GEMINI')).toBe(0);
  });
});

describe('PricingService wiring', () => {
  const pricing = new PricingService({ modelPricing: { findMany: async () => [] } } as any, { getCache: async () => null } as any);

  it('estimateTokens is the conservative estimator (it is also the billing fallback when a provider omits usage)', () => {
    expect(pricing.estimateTokens(CORPORA.chinese)).toBe(estimateTextTokens(CORPORA.chinese));
    expect(pricing.estimateTokens(CORPORA.chinese)).toBeGreaterThan(legacy(CORPORA.chinese) * 3);
  });

  it('a CJK-heavy prompt now reserves at least what its real token count costs (previously ~1/3 of it)', () => {
    const msgs = [{ content: CORPORA.chinese }];
    const real = Math.max(o200k.encode(CORPORA.chinese).length, cl100k.encode(CORPORA.chinese).length);
    const reservedCost = pricing.estimateMaxCost('gpt-4o', pricing.estimateReservationTokens('OPENAI', msgs), 0);
    const realCost = pricing.estimateMaxCost('gpt-4o', real, 0);
    const oldCost = pricing.estimateMaxCost('gpt-4o', legacy(CORPORA.chinese), 0);
    expect(reservedCost).toBeGreaterThanOrEqual(realCost);
    expect(oldCost).toBeLessThan(realCost); // the bug: the old hold was below the true input cost
  });

  it('output reservation is max_tokens plus the optional Gemini reserve only', () => {
    expect(pricing.reservedOutputTokens('OPENAI', 500)).toBe(500);
    process.env.GATEWAY_GEMINI_THINKING_RESERVE_TOKENS = '1000';
    expect(pricing.reservedOutputTokens('GEMINI', 500)).toBe(1500);
  });
});
