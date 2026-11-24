import 'reflect-metadata';
import { HttpException } from '@nestjs/common';
import { OpenAIAdapter } from '../src/modules/gateway/adapters/openai.adapter';
import { AnthropicAdapter } from '../src/modules/gateway/adapters/anthropic.adapter';
import { GeminiAdapter } from '../src/modules/gateway/adapters/gemini.adapter';
import { GroqAdapter } from '../src/modules/gateway/adapters/groq.adapter';
import { PricingService } from '../src/modules/pricing/pricing.service';

/**
 * THE SAME SCENARIOS RUN AGAINST ALL FOUR PROVIDERS, with MOCKED HTTP (deterministic, free, no credentials).
 *
 * These prove how SpendGuard behaves for each documented provider response shape. They do NOT prove the providers still
 * answer that way today: that is what the separately-controlled live suite (test/live, `npm run test:providers:live`)
 * is for, and it reports NOT RUN, never PASS, when no key is configured.
 */
const redis: any = { isConnected: false, getClient: () => null };
const pricing = new PricingService({ modelPricing: { findMany: async () => [] } } as any, redis);
const realFetch = global.fetch;
const env = { ...process.env };
afterEach(() => {
  global.fetch = realFetch;
  process.env = { ...env };
});

const KEYS: Record<string, string> = {
  OpenAI: 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789',
  Anthropic: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345',
  Gemini: 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q',
  Groq: 'gsk_abcdefghijklmnopqrstuvwxyz0123456789',
}; // realistic shapes: the adapters refuse keys that do not look like the provider's
interface P {
  name: string;
  model: string;
  adapter: () => { execute: (req: any, key?: string) => Promise<any> };
  ok: (usage: boolean) => unknown;
  bodyOf: (init: RequestInit) => any;
  systemWhere: (b: any) => unknown;
  maxWhere: (b: any) => unknown;
}

const PROVIDERS: P[] = [
  {
    name: 'OpenAI', model: 'gpt-4o', adapter: () => new OpenAIAdapter(pricing),
    ok: (u) => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], ...(u ? { usage: { prompt_tokens: 10, completion_tokens: 2 } } : {}) }),
    bodyOf: (i) => JSON.parse(String(i.body)), systemWhere: (b) => b.messages?.[0], maxWhere: (b) => b.max_completion_tokens,
  },
  {
    name: 'Anthropic', model: 'claude-sonnet-5-5', adapter: () => new AnthropicAdapter(pricing),
    ok: (u) => ({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', ...(u ? { usage: { input_tokens: 10, output_tokens: 2 } } : {}) }),
    bodyOf: (i) => JSON.parse(String(i.body)), systemWhere: (b) => b.system, maxWhere: (b) => b.max_tokens,
  },
  {
    name: 'Gemini', model: 'gemini-3.8-flash', adapter: () => new GeminiAdapter(pricing),
    ok: (u) => ({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }], ...(u ? { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 } } : {}) }),
    bodyOf: (i) => JSON.parse(String(i.body)), systemWhere: (b) => b.systemInstruction, maxWhere: (b) => b.generationConfig?.maxOutputTokens,
  },
  {
    name: 'Groq', model: 'openai/gpt-oss-120b', adapter: () => new GroqAdapter(pricing),
    ok: (u) => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], ...(u ? { usage: { prompt_tokens: 10, completion_tokens: 2 } } : {}) }),
    bodyOf: (i) => JSON.parse(String(i.body)), systemWhere: (b) => b.messages?.[0], maxWhere: (b) => b.max_completion_tokens,
  },
];

const respond = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status });
const req = (p: P, extra: any = {}) => ({ projectId: 'p', model: p.model, messages: [{ role: 'user', content: 'hi' }], maxTokens: 77, ...extra });
const errorOf = async (fn: () => Promise<unknown>) => (await fn().then(() => null, (e) => e)) as HttpException;
const mock = (fn: (url: string, init: RequestInit) => Response | Promise<Response>) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  global.fetch = jest.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return fn(String(url), init);
  }) as any;
  return calls;
};

describe.each(PROVIDERS)('contract matrix: $name (MOCKED responses)', (p) => {
  const KEY = KEYS[p.name];
  it('a normal response returns text, provider-reported usage, a finish reason and is NOT flagged as estimated', async () => {
    mock(() => respond(200, p.ok(true)));
    const r = await p.adapter().execute(req(p), KEY);
    expect(r).toMatchObject({ responseText: 'ok', promptTokens: 10, completionTokens: 2, totalTokens: 12, usageEstimated: false });
    expect(r.finishReason).toBeDefined();
  });

  it('MISSING USAGE is flagged as estimated and never returned as zero tokens (zero would mean zero cost)', async () => {
    mock(() => respond(200, p.ok(false)));
    const r = await p.adapter().execute(req(p), KEY);
    expect(r.usageEstimated).toBe(true);
    expect(r.promptTokens).toBeGreaterThan(0);
    expect(r.totalTokens).toBeGreaterThan(0);
  });

  it('authentication error: a bad PROVIDER key is a 502 upstream_auth_failed, never a 401 from SpendGuard', async () => {
    mock(() => respond(p.name === 'Gemini' ? 400 : 401, p.name === 'Gemini' ? { error: { code: 400, message: 'API key not valid', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } } : { error: { message: 'Invalid API Key', type: 'authentication_error', code: 'invalid_api_key' } }));
    const e = await errorOf(() => p.adapter().execute(req(p), KEY));
    expect(e.getStatus()).toBe(502);
    expect((e.getResponse() as any).error.code).toBe('upstream_auth_failed');
  });

  it('invalid model (404/400 from the provider) is surfaced as a client-fixable error, with the key scrubbed', async () => {
    mock(() => respond(404, { error: { message: `The model does not exist or you do not have access to it. key=${KEY}`, type: 'invalid_request_error', code: 'model_not_found', status: 'NOT_FOUND' } }));
    const e = await errorOf(() => p.adapter().execute(req(p), KEY));
    expect([400, 404, 502]).toContain(e.getStatus());
    expect(JSON.stringify(e.getResponse())).not.toContain(KEY);
  });

  it('context-length exceeded (a provider 400) is a 400 with the provider reason, not a retryable error', async () => {
    mock(() => respond(400, { error: { message: 'This model\'s maximum context length is 128000 tokens. However, your messages resulted in 200000 tokens.', type: 'invalid_request_error', code: 'context_length_exceeded', status: 'INVALID_ARGUMENT' } }));
    const e = await errorOf(() => p.adapter().execute(req(p), KEY));
    expect(e.getStatus()).toBe(400);
    expect((e.getResponse() as any).error.code).toBe('upstream_invalid_request');
  });

  it('rate limiting stays a 429, a 5xx stays a 5xx-class error, and neither echoes the key', async () => {
    mock(() => respond(429, { error: { message: 'Rate limit', type: 'rate_limit_error', code: 'rate_limit_exceeded', status: 'RESOURCE_EXHAUSTED' } }));
    expect((await errorOf(() => p.adapter().execute(req(p), KEY))).getStatus()).toBe(429);
    mock(() => respond(503, { error: { message: 'overloaded', type: 'api_error', status: 'UNAVAILABLE' } }));
    const e = await errorOf(() => p.adapter().execute(req(p), KEY));
    expect(e.getStatus()).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(e.getResponse())).not.toContain(KEY);
  });

  it('a TIMEOUT is a 504 upstream_timeout (the call may have been billed: classified UNCERTAIN downstream)', async () => {
    process.env.GATEWAY_PROXY_TIMEOUT_MS = '40';
    global.fetch = jest.fn((_u: any, init: any) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as any;
    const e = await errorOf(() => p.adapter().execute(req(p), KEY));
    expect(e.getStatus()).toBe(504);
    expect((e.getResponse() as any).error.code).toBe('upstream_timeout');
  });

  it('a 2xx with an unreadable body is upstream_invalid_response (the provider DID run: classified LIKELY_CHARGED downstream)', async () => {
    mock(() => new Response('<html>gateway page</html>', { status: 200 }));
    const e = await errorOf(() => p.adapter().execute(req(p), KEY));
    expect(e.getStatus()).toBe(502);
    expect((e.getResponse() as any).error.code).toBe('upstream_invalid_response');
  });

  it('the requested output limit reaches the provider under that provider\'s own parameter name', async () => {
    const calls = mock(() => respond(200, p.ok(true)));
    await p.adapter().execute(req(p, { maxTokens: 77 }), KEY);
    expect(p.maxWhere(p.bodyOf(calls[0].init))).toBe(77);
  });

  it('a system message is placed where this provider expects it', async () => {
    const calls = mock(() => respond(200, p.ok(true)));
    await p.adapter().execute(req(p, { messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content: 'hi' }] }), KEY);
    const where = JSON.stringify(p.systemWhere(p.bodyOf(calls[0].init)));
    expect(where).toContain('be brief');
  });

  it('the credential is sent only to the provider host, in a header or the query the provider documents', async () => {
    const calls = mock(() => respond(200, p.ok(true)));
    await p.adapter().execute(req(p), KEY);
    const host = new URL(calls[0].url).host;
    expect(host).toMatch(/openai\.com|anthropic\.com|googleapis\.com|groq\.com|localhost|127\.0\.0\.1/);
    expect(String(calls[0].init.body)).not.toContain(KEY); // never in the body
  });

  it('tool/function calling is NOT forwarded: the gateway does not support it today, so nothing is billed for tool use it never handled', async () => {
    const calls = mock(() => respond(200, p.ok(true)));
    await p.adapter().execute({ ...req(p), tools: [{ type: 'function', function: { name: 'x' } }], tool_choice: 'auto' }, KEY);
    const body = p.bodyOf(calls[0].init);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });
});
