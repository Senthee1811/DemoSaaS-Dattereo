import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { OpenAIAdapter } from '../src/modules/gateway/adapters/openai.adapter';
import { GroqAdapter } from '../src/modules/gateway/adapters/groq.adapter';
import { AnthropicAdapter, buildAnthropicBody } from '../src/modules/gateway/adapters/anthropic.adapter';
import { GeminiAdapter, buildGeminiBody } from '../src/modules/gateway/adapters/gemini.adapter';
import { buildOpenAiCompatibleBody } from '../src/modules/gateway/adapters/openai-compatible';
import { finishFromAnthropic, finishFromGemini, finishFromOpenAiCompatible } from '../src/modules/gateway/adapters/finish-reason';
import { PricingService } from '../src/modules/pricing/pricing.service';

/**
 * Contract tests. The fixtures are built from the providers' OFFICIAL documentation (each file carries
 * a `_provenance` note stating exactly what it was derived from and that it is not a live capture; there are
 * no provider keys in this repository to record live traffic). When a provider changes its response format,
 * these are where the change is meant to be noticed and documented.
 */
const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', 'providers', name), 'utf8'));
const pricing = new PricingService({ modelPricing: { findMany: async () => [] } } as any, { getCache: async () => null } as any);

const realFetch = global.fetch;
const env = { ...process.env };
afterEach(() => {
  global.fetch = realFetch;
  process.env = { ...env };
});
const respondWith = (body: unknown) => {
  const f = jest.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
  global.fetch = f as any;
  return f;
};
const sentBody = (f: jest.Mock) => JSON.parse(((f.mock.calls[0] as unknown) as [string, any])[1].body);
const msgs = [
  { role: 'system' as const, content: 'Be brief.' },
  { role: 'user' as const, content: 'Capital of Italy?' },
];
const base = { projectId: 'p', messages: msgs, maxTokens: 123 };

describe('every fixture states where it came from', () => {
  it.each(['openai-chat-completion.json', 'openai-chat-truncated.json', 'anthropic-message-thinking-cache.json', 'anthropic-message-refusal.json', 'gemini-generate-content-thinking-cached.json', 'gemini-generate-content-blocked-prompt.json', 'groq-chat-completion.json'])(
    '%s',
    (file) => {
      const p = fixture(file)._provenance as string;
      expect(p).toMatch(/Documentation-derived fixture \(NOT a live capture\)/);
      expect(p).toMatch(/2026-11-24/);
    },
  );
});

describe('OpenAI', () => {
  it('fixture: cached tokens are a subset of the prompt, reasoning is inside completion tokens, finish_reason passes through', async () => {
    respondWith(fixture('openai-chat-completion.json'));
    const r = await new OpenAIAdapter(pricing).execute({ ...base, model: 'gpt-4o' }, 'sk-test-0123456789abcdef');
    expect(r).toMatchObject({ promptTokens: 2006, completionTokens: 300, totalTokens: 2306, cachedPromptTokens: 1920, reasoningTokens: 256, finishReason: 'stop', providerFinishReason: 'stop', usageEstimated: false });
    // billing: 86 fresh + 1920 cached input tokens, 300 output (reasoning NOT added again)
    const cost = pricing.calculateCost('gpt-4o', r.promptTokens, r.completionTokens, { cachedTokens: r.cachedPromptTokens });
    expect(cost).toBeCloseTo((86 * 2.5 + 1920 * 1.25 + 300 * 10) / 1_000_000, 9);
  });

  it('a truncated answer reports finish_reason "length" (billed, and visible to the caller)', async () => {
    respondWith(fixture('openai-chat-truncated.json'));
    const r = await new OpenAIAdapter(pricing).execute({ ...base, model: 'gpt-4o' }, 'sk-test-0123456789abcdef');
    expect(r.finishReason).toBe('length');
    expect(r.completionTokens).toBe(8);
  });

  it('sends the output limit as max_completion_tokens (max_tokens is deprecated and rejected by o-series models)', async () => {
    const f = respondWith(fixture('openai-chat-completion.json'));
    await new OpenAIAdapter(pricing).execute({ ...base, model: 'gpt-4o' }, 'sk-test-0123456789abcdef');
    const body = sentBody(f);
    expect(body.max_completion_tokens).toBe(123);
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('OPENAI_MAX_TOKENS_PARAM=max_tokens switches the name for compatible endpoints that only know the old one', async () => {
    process.env.OPENAI_MAX_TOKENS_PARAM = 'max_tokens';
    const f = respondWith(fixture('openai-chat-completion.json'));
    await new OpenAIAdapter(pricing).execute({ ...base, model: 'gpt-4o' }, 'sk-test-0123456789abcdef');
    expect(sentBody(f)).toMatchObject({ max_tokens: 123 });
    expect(sentBody(f)).not.toHaveProperty('max_completion_tokens');
  });

  it('system messages stay "system" by default; OPENAI_SYSTEM_ROLE=developer sends the newer role (OpenAI: o1 and newer)', () => {
    expect(buildOpenAiCompatibleBody({ ...base, model: 'gpt-4o' } as any, { forOpenAi: true }).messages[0].role).toBe('system');
    process.env.OPENAI_SYSTEM_ROLE = 'developer';
    const b = buildOpenAiCompatibleBody({ ...base, model: 'gpt-4o' } as any, { forOpenAi: true });
    expect(b.messages[0]).toEqual({ role: 'developer', content: 'Be brief.' });
    expect(b.messages[1].role).toBe('user');
    // the knob is OpenAI-only: Groq documents system/user and never receives `developer`
    expect(buildOpenAiCompatibleBody({ ...base, model: 'x' } as any).messages[0].role).toBe('system');
  });
});

describe('Anthropic', () => {
  it('fixture: text is read past the thinking block; input = input + cache read + cache writes; writes carry their TTL', async () => {
    respondWith(fixture('anthropic-message-thinking-cache.json'));
    const r = await new AnthropicAdapter(pricing).execute({ ...base, model: 'claude-sonnet-5-5' }, 'sk-ant-api03-FAKEFAKEFAKEFAKE');
    expect(r).toMatchObject({
      responseText: 'Rome.',
      promptTokens: 50 + 100000 + 1500 + 500,
      completionTokens: 120,
      cachedPromptTokens: 100000,
      cacheWriteTokens: { fiveMinute: 1500, oneHour: 500 },
      finishReason: 'stop',
      providerFinishReason: 'end_turn',
      usageEstimated: false,
    });
    // reads at 0.05x ($0.10/M), writes at 1.25x / 2x of $2/M (documented multipliers)
    const cost = pricing.calculateCost('claude-sonnet-5-5', r.promptTokens, r.completionTokens, { cachedTokens: r.cachedPromptTokens, cacheWriteTokens: r.cacheWriteTokens });
    expect(cost).toBeCloseTo((50 * 2 + 100000 * 0.1 + 1500 * 2.5 + 500 * 4 + 120 * 10) / 1_000_000, 9);
  });

  it('a refusal is a 200 with stop_reason "refusal" and maps to content_filter (tokens are still billed)', async () => {
    respondWith(fixture('anthropic-message-refusal.json'));
    const r = await new AnthropicAdapter(pricing).execute({ ...base, model: 'claude-sonnet-5-5' }, 'sk-ant-api03-FAKEFAKEFAKEFAKE');
    expect(r).toMatchObject({ finishReason: 'content_filter', providerFinishReason: 'refusal', completionTokens: 7 });
  });

  it('system goes to the top-level field, max_tokens is the (required) output limit and covers thinking', () => {
    const b = buildAnthropicBody({ ...base, model: 'claude-sonnet-5-5' } as any);
    expect(b).toMatchObject({ system: 'Be brief.', max_tokens: 123 });
    expect(b.messages).toEqual([{ role: 'user', content: 'Capital of Italy?' }]);
  });
});

describe('Gemini', () => {
  it('fixture: prompt includes cached tokens; thinking tokens are added to billed output; total equals Google\'s totalTokenCount', async () => {
    respondWith(fixture('gemini-generate-content-thinking-cached.json'));
    const r = await new GeminiAdapter(pricing).execute({ ...base, model: 'gemini-3.8-flash' }, 'AIzaSyFAKEKEYFORTESTING1234567890');
    expect(r).toMatchObject({ promptTokens: 5000, completionTokens: 315, totalTokens: 5315, cachedPromptTokens: 4000, reasoningTokens: 312, finishReason: 'stop', providerFinishReason: 'STOP' });
    expect(r.totalTokens).toBe(fixture('gemini-generate-content-thinking-cached.json').usageMetadata.totalTokenCount);
    const cost = pricing.calculateCost('gemini-3.8-flash', r.promptTokens, r.completionTokens, { cachedTokens: r.cachedPromptTokens });
    // costs are rounded to 6 decimals (USD micro-dollars), so compare at that precision
    expect(cost).toBeCloseTo((1000 * 0.75 + 4000 * 0.075 + 315 * 3.75) / 1_000_000, 6);
  });

  it('a blocked prompt (no candidates) maps to content_filter and is not given invented output tokens', async () => {
    respondWith(fixture('gemini-generate-content-blocked-prompt.json'));
    const r = await new GeminiAdapter(pricing).execute({ ...base, model: 'gemini-3.8-flash' }, 'AIzaSyFAKEKEYFORTESTING1234567890');
    expect(r).toMatchObject({ responseText: '', finishReason: 'content_filter', promptTokens: 12, completionTokens: 0 });
  });

  it('system goes to systemInstruction; maxOutputTokens enforces the limit', () => {
    const b = buildGeminiBody({ ...base, model: 'gemini-3.8-flash' } as any);
    expect(b.systemInstruction).toEqual({ parts: [{ text: 'Be brief.' }] });
    expect(b.generationConfig.maxOutputTokens).toBe(123);
  });
});

describe('Groq', () => {
  it('fixture: cached_tokens is a subset of prompt_tokens; extra timing fields are ignored; max_completion_tokens is sent', async () => {
    const f = respondWith(fixture('groq-chat-completion.json'));
    const r = await new GroqAdapter(pricing).execute({ ...base, model: 'openai/gpt-oss-120b' }, 'gsk_tenant_key_123456');
    expect(r).toMatchObject({ promptTokens: 4641, completionTokens: 20, cachedPromptTokens: 4608, finishReason: 'stop' });
    expect(sentBody(f)).toMatchObject({ max_completion_tokens: 123 });
    expect(sentBody(f)).not.toHaveProperty('max_tokens');
    // none of the fields Groq rejects (logprobs, logit_bias, top_logprobs, messages[].name) are ever sent
    for (const rejected of ['logprobs', 'logit_bias', 'top_logprobs']) expect(sentBody(f)).not.toHaveProperty(rejected);
    expect(sentBody(f).messages.every((m: any) => !('name' in m))).toBe(true);
  });
});

describe('finish reasons: every documented value maps, unknown values are kept verbatim', () => {
  it.each([
    ['stop', 'stop'], ['length', 'length'], ['tool_calls', 'tool_calls'], ['content_filter', 'content_filter'], ['function_call', 'tool_calls'],
  ])('OpenAI/Groq %s → %s', (raw, expected) => expect(finishFromOpenAiCompatible(raw)).toEqual({ finishReason: expected, providerFinishReason: raw }));

  it.each([
    ['end_turn', 'stop'], ['stop_sequence', 'stop'], ['max_tokens', 'length'], ['model_context_window_exceeded', 'length'],
    ['tool_use', 'tool_calls'], ['pause_turn', 'tool_calls'], ['refusal', 'content_filter'],
  ])('Anthropic %s → %s', (raw, expected) => expect(finishFromAnthropic(raw)).toEqual({ finishReason: expected, providerFinishReason: raw }));

  it.each([
    ['STOP', 'stop'], ['MAX_TOKENS', 'length'], ['CONTINUATION', 'length'], ['SAFETY', 'content_filter'], ['RECITATION', 'content_filter'],
    ['LANGUAGE', 'content_filter'], ['BLOCKLIST', 'content_filter'], ['PROHIBITED_CONTENT', 'content_filter'], ['SPII', 'content_filter'],
    ['IMAGE_SAFETY', 'content_filter'], ['IMAGE_PROHIBITED_CONTENT', 'content_filter'], ['IMAGE_RECITATION', 'content_filter'], ['ESCALATION', 'content_filter'],
    ['PUP_LIMITED_DISABLED', 'content_filter'], ['MALFORMED_FUNCTION_CALL', 'tool_calls'], ['UNEXPECTED_TOOL_CALL', 'tool_calls'], ['TOO_MANY_TOOL_CALLS', 'tool_calls'],
  ])('Gemini %s → %s', (raw, expected) => expect(finishFromGemini(raw)).toEqual({ finishReason: expected, providerFinishReason: raw }));

  it('Gemini values with no OpenAI equivalent (OTHER, MALFORMED_RESPONSE, NO_IMAGE, ...) and brand-new values map to "stop" but the raw value is preserved', () => {
    for (const raw of ['OTHER', 'MALFORMED_RESPONSE', 'NO_IMAGE', 'MISSING_THOUGHT_SIGNATURE', 'SOMETHING_NEW_IN_2027']) {
      expect(finishFromGemini(raw)).toEqual({ finishReason: 'stop', providerFinishReason: raw });
    }
    expect(finishFromAnthropic('brand_new')).toEqual({ finishReason: 'stop', providerFinishReason: 'brand_new' });
  });

  it('a missing finish reason is not invented: raw is null', () => {
    expect(finishFromOpenAiCompatible(undefined)).toEqual({ finishReason: 'stop', providerFinishReason: null });
    expect(finishFromGemini(undefined, true)).toEqual({ finishReason: 'content_filter', providerFinishReason: null });
  });
});
