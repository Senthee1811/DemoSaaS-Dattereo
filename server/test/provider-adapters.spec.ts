import 'reflect-metadata';
import { HttpException } from '@nestjs/common';
import { GeminiAdapter, buildGeminiBody, parseGeminiResponse } from '../src/modules/gateway/adapters/gemini.adapter';
import { AnthropicAdapter, buildAnthropicBody, parseAnthropicResponse } from '../src/modules/gateway/adapters/anthropic.adapter';
import { OpenAIAdapter } from '../src/modules/gateway/adapters/openai.adapter';
import { GroqAdapter } from '../src/modules/gateway/adapters/groq.adapter';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { GatewayChatRequest } from '../src/modules/gateway/adapters/provider.adapter.interface';

const redis: any = { isConnected: false, getClient: () => null };
const pricing = new PricingService({ modelPricing: { findMany: async () => [] } } as any, redis);
const estimate = (t: string) => pricing.estimateTokens(t);

const realFetch = global.fetch;
const env = { ...process.env };
afterEach(() => {
  global.fetch = realFetch;
  process.env = { ...env };
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const mockFetch = (res: Response) => {
  const f = jest.fn(async () => res);
  global.fetch = f as any;
  return f;
};
const sent = (f: jest.Mock) => {
  const [url, init] = f.mock.calls[0] as unknown as [string, any];
  return { url, headers: init.headers, body: JSON.parse(init.body) };
};

const withSystem = (extra: Partial<GatewayChatRequest> = {}): GatewayChatRequest => ({
  projectId: 'p1',
  model: 'gemini-3.8-flash',
  messages: [
    { role: 'system', content: 'You are a terse assistant. Reply in French.' },
    { role: 'user', content: 'What is the capital of France?' },
    { role: 'assistant', content: 'Paris.' },
    { role: 'user', content: 'And Italy?' },
  ],
  maxTokens: 256,
  ...extra,
});

// ───────────────────────────── Gemini ─────────────────────────────

describe('Gemini request mapping', () => {
  it('enforces max_tokens as generationConfig.maxOutputTokens (the cap the budget hold assumes)', () => {
    const body = buildGeminiBody(withSystem({ maxTokens: 256 }));
    expect(body.generationConfig.maxOutputTokens).toBe(256);
  });

  it('defaults maxOutputTokens to 1000, the same default the hold is sized with', () => {
    expect(buildGeminiBody(withSystem({ maxTokens: undefined })).generationConfig.maxOutputTokens).toBe(1000);
  });

  it('forwards temperature when set (including 0) and omits it when not set', () => {
    expect(buildGeminiBody(withSystem({ temperature: 0.2 })).generationConfig).toMatchObject({ temperature: 0.2 });
    expect(buildGeminiBody(withSystem({ temperature: 0 })).generationConfig).toHaveProperty('temperature', 0);
    expect(buildGeminiBody(withSystem({ temperature: undefined })).generationConfig).not.toHaveProperty('temperature');
  });

  it('preserves the system role: it goes to systemInstruction and never appears in contents', () => {
    const body = buildGeminiBody(withSystem());
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'You are a terse assistant. Reply in French.' }] });
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'What is the capital of France?' }] },
      { role: 'model', parts: [{ text: 'Paris.' }] },
      { role: 'user', parts: [{ text: 'And Italy?' }] },
    ]);
    expect(JSON.stringify(body.contents)).not.toContain('terse assistant');
  });

  it('joins several system messages in order and omits systemInstruction when there are none', () => {
    const two = buildGeminiBody({
      ...withSystem(),
      messages: [
        { role: 'system', content: 'Rule one.' },
        { role: 'user', content: 'hi' },
        { role: 'system', content: 'Rule two.' },
      ],
    });
    expect(two.systemInstruction?.parts[0].text).toBe('Rule one.\n\nRule two.');
    const none = buildGeminiBody({ ...withSystem(), messages: [{ role: 'user', content: 'hi' }] });
    expect(none).not.toHaveProperty('systemInstruction');
  });

  it('a conversation with only system messages is rejected 400 before any upstream call', async () => {
    const f = mockFetch(json({}));
    const err = await new GeminiAdapter(pricing)
      .execute({ ...withSystem(), messages: [{ role: 'system', content: 'only system' }] }, 'AIzaSyFAKEKEYFORTESTING1234567890')
      .catch((e) => e as HttpException);
    expect((err as HttpException).getStatus()).toBe(400);
    expect(((err as HttpException).getResponse() as any).error.code).toBe('invalid_messages');
    expect(f).not.toHaveBeenCalled();
  });

  it('end to end: key in x-goog-api-key header (not the URL), model path is encoded, body is the mapped one', async () => {
    const f = mockFetch(
      json({
        candidates: [{ content: { role: 'model', parts: [{ text: 'Rome.' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 2, totalTokenCount: 42 },
      }),
    );
    const key = 'AIzaSyFAKEKEYFORTESTING1234567890';
    await new GeminiAdapter(pricing).execute(withSystem({ temperature: 0.5 }), key);
    const { url, headers, body } = sent(f);
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    expect(url).not.toContain(key);
    expect(headers['x-goog-api-key']).toBe(key);
    expect(body.generationConfig).toEqual({ maxOutputTokens: 256, temperature: 0.5 });
    expect(body.systemInstruction).toBeDefined();
  });

  it('a model id cannot escape the path', async () => {
    const f = mockFetch(json({ candidates: [], usageMetadata: { promptTokenCount: 1 } }));
    await new GeminiAdapter(pricing).execute(withSystem({ model: 'x/../../evil?y=1' }), 'AIzaSyFAKEKEYFORTESTING1234567890');
    expect(sent(f).url).toBe('https://generativelanguage.googleapis.com/v1beta/models/x%2F..%2F..%2Fevil%3Fy%3D1:generateContent');
  });
});

describe('Gemini usage: thinking and cached tokens', () => {
  // Real shape: thoughtsTokenCount is reported separately and totalTokenCount includes it.
  const thinking = {
    candidates: [{ content: { role: 'model', parts: [{ text: 'Rome.' }] }, finishReason: 'STOP', index: 0 }],
    usageMetadata: { promptTokenCount: 25, candidatesTokenCount: 3, totalTokenCount: 340, thoughtsTokenCount: 312 },
    modelVersion: 'gemini-2.5-flash',
  };

  it('bills thinking tokens as output: completion = candidates + thoughts', () => {
    const r = parseGeminiResponse(thinking, estimate, 1);
    expect(r.promptTokens).toBe(25);
    expect(r.completionTokens).toBe(315);
    expect(r.totalTokens).toBe(340); // equals Google's own totalTokenCount
    expect(r.reasoningTokens).toBe(312);
    expect(r.usageEstimated).toBe(false);
  });

  it('thinking is what makes the old candidates-only maths wrong in money terms', () => {
    const r = parseGeminiResponse(thinking, estimate, 1);
    const right = pricing.calculateCost('gemini-3.8-flash', r.promptTokens, r.completionTokens);
    const old = pricing.calculateCost('gemini-3.8-flash', 25, 3);
    expect(right).toBeGreaterThan(old * 10);
  });

  it('reads cachedContentTokenCount as part of promptTokenCount (not added on top)', () => {
    const r = parseGeminiResponse(
      {
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        usageMetadata: { promptTokenCount: 5000, cachedContentTokenCount: 4000, candidatesTokenCount: 10, totalTokenCount: 5010 },
      },
      estimate,
      1,
    );
    expect(r.promptTokens).toBe(5000);
    expect(r.cachedPromptTokens).toBe(4000);
  });

  it('never lets cached exceed the prompt', () => {
    const r = parseGeminiResponse(
      { candidates: [], usageMetadata: { promptTokenCount: 100, cachedContentTokenCount: 900, candidatesTokenCount: 1 } },
      estimate,
      1,
    );
    expect(r.cachedPromptTokens).toBe(100);
  });

  it('excludes thought-summary parts from the returned text', () => {
    const r = parseGeminiResponse(
      {
        candidates: [{ content: { parts: [{ text: 'internal reasoning', thought: true }, { text: 'Answer.' }] } }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
      },
      estimate,
      1,
    );
    expect(r.responseText).toBe('Answer.');
  });

  it('a blocked response (usageMetadata, no candidates) has zero completion tokens, not an invented number', () => {
    const r = parseGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' }, usageMetadata: { promptTokenCount: 12 } }, estimate, 1);
    expect(r).toMatchObject({ responseText: '', promptTokens: 12, completionTokens: 0, usageEstimated: false });
  });

  it('with no usageMetadata at all it falls back to estimates AND says so', () => {
    const r = parseGeminiResponse({ candidates: [{ content: { parts: [{ text: 'twelve chars' }] } }] }, estimate, 7);
    expect(r.usageEstimated).toBe(true);
    expect(r.promptTokens).toBe(7);
    expect(r.completionTokens).toBe(estimate('twelve chars'));
  });
});

// ───────────────────────────── Anthropic ─────────────────────────────

describe('Anthropic request mapping', () => {
  const req = (extra: Partial<GatewayChatRequest> = {}) => withSystem({ model: 'claude-sonnet-5-5', ...extra });

  it('preserves the system role: top-level `system`, and no system turn inside messages', () => {
    const body = buildAnthropicBody(req());
    expect(body.system).toBe('You are a terse assistant. Reply in French.');
    expect(body.messages).toEqual([
      { role: 'user', content: 'What is the capital of France?' },
      { role: 'assistant', content: 'Paris.' },
      { role: 'user', content: 'And Italy?' },
    ]);
    expect(JSON.stringify(body.messages)).not.toContain('terse assistant');
  });

  it('joins several system messages and omits `system` when there are none', () => {
    const two = buildAnthropicBody({
      ...req(),
      messages: [
        { role: 'system', content: 'A' },
        { role: 'user', content: 'hi' },
        { role: 'system', content: 'B' },
      ],
    });
    expect(two.system).toBe('A\n\nB');
    expect(buildAnthropicBody({ ...req(), messages: [{ role: 'user', content: 'hi' }] })).not.toHaveProperty('system');
  });

  it('forwards max_tokens and temperature (defaulting like the other providers)', () => {
    const body = buildAnthropicBody(req({ maxTokens: 321, temperature: 0.1 }));
    expect(body).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 321, temperature: 0.1 });
    expect(buildAnthropicBody(req({ maxTokens: undefined, temperature: undefined }))).toMatchObject({ max_tokens: 1000, temperature: 0.7 });
  });

  it('system-only conversations are rejected 400 before any upstream call', async () => {
    const f = mockFetch(json({}));
    const err = await new AnthropicAdapter(pricing)
      .execute({ ...req(), messages: [{ role: 'system', content: 'only system' }] }, 'sk-ant-api03-FAKEFAKEFAKEFAKE')
      .catch((e) => e as HttpException);
    expect((err as HttpException).getStatus()).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('end to end: x-api-key and anthropic-version headers, /v1/messages endpoint', async () => {
    const f = mockFetch(
      json({ type: 'message', role: 'assistant', content: [{ type: 'text', text: 'Roma.' }], usage: { input_tokens: 30, output_tokens: 4 } }),
    );
    await new AnthropicAdapter(pricing).execute(req(), 'sk-ant-api03-FAKEFAKEFAKEFAKE');
    const { url, headers, body } = sent(f);
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(headers['x-api-key']).toBe('sk-ant-api03-FAKEFAKEFAKEFAKE');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(body.system).toBeDefined();
  });
});

describe('Anthropic response and usage', () => {
  it('reads text from text blocks even when content[0] is a thinking block (always-on thinking models)', () => {
    const r = parseAnthropicResponse(
      {
        content: [
          { type: 'thinking', thinking: 'Let me think...', signature: 'EqQBCg...' },
          { type: 'text', text: 'Hello!' },
          { type: 'text', text: ' Second block.' },
        ],
        usage: { input_tokens: 50, output_tokens: 120 },
      },
      estimate,
      1,
    );
    expect(r.responseText).toBe('Hello! Second block.');
    expect(r.completionTokens).toBe(120); // output_tokens already includes thinking
  });

  it('total input = input_tokens + cache_read + cache_creation (input_tokens EXCLUDES cache)', () => {
    const r = parseAnthropicResponse(
      {
        content: [{ type: 'text', text: 'x' }],
        usage: {
          input_tokens: 50,
          cache_read_input_tokens: 100000,
          cache_creation_input_tokens: 2000,
          cache_creation: { ephemeral_5m_input_tokens: 1500, ephemeral_1h_input_tokens: 500 },
          output_tokens: 10,
        },
      },
      estimate,
      1,
    );
    expect(r.promptTokens).toBe(50 + 100000 + 2000);
    expect(r.cachedPromptTokens).toBe(100000);
    expect(r.cacheWriteTokens).toEqual({ fiveMinute: 1500, oneHour: 500 });
  });

  it('without a TTL breakdown, cache writes default to the documented 5-minute TTL', () => {
    const r = parseAnthropicResponse(
      { content: [{ type: 'text', text: 'x' }], usage: { input_tokens: 10, cache_creation_input_tokens: 300, output_tokens: 1 } },
      estimate,
      1,
    );
    expect(r.cacheWriteTokens).toEqual({ fiveMinute: 300, oneHour: 0 });
  });

  it('no usage block → estimates, flagged as estimated', () => {
    const r = parseAnthropicResponse({ content: [{ type: 'text', text: 'abcd' }] }, estimate, 9);
    expect(r).toMatchObject({ promptTokens: 9, completionTokens: estimate('abcd'), usageEstimated: true });
  });
});

// ───────────────────────────── OpenAI / Groq ─────────────────────────────

describe('OpenAI-compatible usage (OpenAI, Groq)', () => {
  const openaiResponse = {
    id: 'chatcmpl-9',
    object: 'chat.completion',
    choices: [{ index: 0, message: { role: 'assistant', content: 'Rome.' }, finish_reason: 'stop' }],
    usage: {
      prompt_tokens: 2006,
      completion_tokens: 300,
      total_tokens: 2306,
      prompt_tokens_details: { cached_tokens: 1920 },
      completion_tokens_details: { reasoning_tokens: 256 },
    },
  };

  it('OpenAI: cached_tokens is a subset of prompt_tokens; reasoning is already in completion_tokens', async () => {
    mockFetch(json(openaiResponse));
    const r = await new OpenAIAdapter(pricing).execute({ projectId: 'p', model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] }, 'sk-test-0123456789abcdef');
    expect(r.promptTokens).toBe(2006);
    expect(r.cachedPromptTokens).toBe(1920);
    expect(r.completionTokens).toBe(300);
    expect(r.reasoningTokens).toBe(256);
    expect(r.totalTokens).toBe(2306);
  });

  it('Groq: same shape (prompt_tokens_details.cached_tokens)', async () => {
    mockFetch(json(openaiResponse));
    const r = await new GroqAdapter(pricing).execute(
      { projectId: 'p', model: 'openai/gpt-oss-120b', messages: [{ role: 'user', content: 'hi' }] },
      'gsk_tenant_key_123456',
    );
    expect(r.cachedPromptTokens).toBe(1920);
  });

  it('a genuine 0 completion_tokens stays 0 (it used to be replaced by an estimate)', async () => {
    mockFetch(json({ choices: [{ message: { content: '' } }], usage: { prompt_tokens: 10, completion_tokens: 0 } }));
    const r = await new OpenAIAdapter(pricing).execute({ projectId: 'p', model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] }, 'sk-test-0123456789abcdef');
    expect(r.completionTokens).toBe(0);
    expect(r.usageEstimated).toBe(false);
  });

  it('missing usage → estimates, flagged', async () => {
    mockFetch(json({ choices: [{ message: { content: 'hello there' } }] }));
    const r = await new OpenAIAdapter(pricing).execute({ projectId: 'p', model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] }, 'sk-test-0123456789abcdef');
    expect(r.usageEstimated).toBe(true);
  });

  it('system messages stay in `messages` for OpenAI-style providers', async () => {
    const f = mockFetch(json(openaiResponse));
    await new OpenAIAdapter(pricing).execute({ ...withSystem(), model: 'gpt-4o' }, 'sk-test-0123456789abcdef');
    expect(sent(f).body.messages[0]).toEqual({ role: 'system', content: 'You are a terse assistant. Reply in French.' });
  });
});
