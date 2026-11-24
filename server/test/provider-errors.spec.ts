import 'reflect-metadata';
import { HttpException } from '@nestjs/common';
import { normalizeUpstreamError, postProviderJson } from '../src/modules/gateway/adapters/provider-http';
import { OpenAIAdapter } from '../src/modules/gateway/adapters/openai.adapter';
import { AnthropicAdapter } from '../src/modules/gateway/adapters/anthropic.adapter';
import { GeminiAdapter } from '../src/modules/gateway/adapters/gemini.adapter';
import { GroqAdapter } from '../src/modules/gateway/adapters/groq.adapter';
import { GlobalHttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { scrubSecrets } from '../src/common/scrub-secrets';

const redis: any = { isConnected: false, getClient: () => null };
const pricing = new PricingService({ modelPricing: { findMany: async () => [] } } as any, redis);

const realFetch = global.fetch;
const env = { ...process.env };
afterEach(() => {
  global.fetch = realFetch;
  process.env = { ...env };
});

const KEYS = {
  openai: 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789',
  anthropic: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345',
  gemini: 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q',
  groq: 'gsk_abcdefghijklmnopqrstuvwxyz0123456789',
};

const errorOf = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    return e as HttpException;
  }
  throw new Error('expected a throw');
};
const body = (e: HttpException) => (e.getResponse() as any).error;
const respond = (status: number, payload: unknown, headers: Record<string, string> = {}) =>
  new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), { status, headers });

// Realistic provider error bodies
const FIXTURES = {
  openai401: { error: { message: `Incorrect API key provided: ${KEYS.openai}. You can find your API key at https://platform.openai.com/account/api-keys.`, type: 'invalid_request_error', param: null, code: 'invalid_api_key' } },
  openai429: { error: { message: 'Rate limit reached for gpt-4o in organization org-123 on tokens per min (TPM): Limit 30000, Used 29000.', type: 'tokens', param: null, code: 'rate_limit_exceeded' } },
  openai400: { error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", type: 'invalid_request_error', param: 'max_tokens', code: 'unsupported_parameter' } },
  anthropic401: { type: 'error', error: { type: 'authentication_error', message: `invalid x-api-key` }, request_id: 'req_011CSHoEeqs5C35K2UUqR7Fy' },
  anthropic429: { type: 'error', error: { type: 'rate_limit_error', message: 'This request would exceed your organization’s rate limit of 50 requests per minute.' } },
  anthropic529: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
  anthropic400: { type: 'error', error: { type: 'invalid_request_error', message: 'max_tokens: 99999999 > 64000, which is the maximum allowed number of output tokens for claude-sonnet-5-5' } },
  anthropic500: { type: 'error', error: { type: 'api_error', message: 'Internal server error' } },
  // Gemini answers a BAD KEY with HTTP 400, not 401
  gemini400BadKey: { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID', domain: 'googleapis.com' }] } },
  gemini400Bad: { error: { code: 400, message: "Invalid JSON payload received. Unknown name \"maxTokens\": Cannot find field.", status: 'INVALID_ARGUMENT' } },
  gemini429: { error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' } },
  gemini403: { error: { code: 403, message: 'Method doesn\'t allow unregistered callers', status: 'PERMISSION_DENIED' } },
  gemini503: { error: { code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' } },
  groq401: { error: { message: 'Invalid API Key', type: 'invalid_request_error', code: 'invalid_api_key' } },
};

describe('error normalization: one SpendGuard format for every provider', () => {
  const norm = (providerLabel: string, status: number, payload: unknown, extra: Partial<Parameters<typeof normalizeUpstreamError>[0]> = {}) =>
    normalizeUpstreamError({ providerLabel, status, rawBody: typeof payload === 'string' ? payload : JSON.stringify(payload), ...extra });

  it.each([
    ['OpenAI', 401, FIXTURES.openai401, KEYS.openai],
    ['Anthropic', 401, FIXTURES.anthropic401, KEYS.anthropic],
    ['Groq', 401, FIXTURES.groq401, KEYS.groq],
    ['Anthropic', 403, { type: 'error', error: { type: 'permission_error', message: 'forbidden' } }, KEYS.anthropic],
    ['Google Gemini', 403, FIXTURES.gemini403, KEYS.gemini],
    ['Google Gemini', 400, FIXTURES.gemini400BadKey, KEYS.gemini],
  ])('%s HTTP %i (provider key rejected) is a 502 upstream_auth_failed, NEVER a 401 SpendGuard auth error', (label, status, payload, key) => {
    const e = norm(label, status, payload, { apiKey: key });
    expect(e.getStatus()).toBe(502);
    expect(e.getStatus()).not.toBe(401);
    expect(body(e)).toMatchObject({ type: 'upstream_provider_error', code: 'upstream_auth_failed', upstream_provider: label, upstream_status: status });
    expect(body(e).message).toContain('not a SpendGuard authentication error');
    // no echo of the provider's own text for credential failures
    expect(JSON.stringify(e.getResponse())).not.toContain(key);
  });

  it('429 stays a 429 with code upstream_rate_limited, carrying retry-after and the provider request id', () => {
    const e = norm('Anthropic', 429, FIXTURES.anthropic429, { retryAfter: '12', upstreamRequestId: 'req_abc123' });
    expect(e.getStatus()).toBe(429);
    expect(body(e)).toMatchObject({ code: 'upstream_rate_limited', retry_after_seconds: 12, upstream_request_id: 'req_abc123', upstream_code: 'rate_limit_error' });
  });

  it('Gemini 429 RESOURCE_EXHAUSTED → 429 upstream_rate_limited with the upstream status string as upstream_code', () => {
    const e = norm('Google Gemini', 429, FIXTURES.gemini429);
    expect(e.getStatus()).toBe(429);
    expect(body(e)).toMatchObject({ code: 'upstream_rate_limited', upstream_code: 'RESOURCE_EXHAUSTED' });
  });

  it('a provider 400 that is about the request keeps its status and the (scrubbed) provider reason, so the caller can fix it', () => {
    const e = norm('OpenAI', 400, FIXTURES.openai400);
    expect(e.getStatus()).toBe(400);
    expect(body(e)).toMatchObject({ code: 'upstream_invalid_request', upstream_code: 'unsupported_parameter' });
    expect(body(e).message).toContain("Unsupported parameter: 'max_tokens'");
  });

  it('Gemini 400 INVALID_ARGUMENT (not about the key) stays an invalid request', () => {
    const e = norm('Google Gemini', 400, FIXTURES.gemini400Bad);
    expect(e.getStatus()).toBe(400);
    expect(body(e).code).toBe('upstream_invalid_request');
  });

  it('Anthropic 400 (max_tokens too large) is an invalid request with the provider reason', () => {
    const e = norm('Anthropic', 400, FIXTURES.anthropic400);
    expect(e.getStatus()).toBe(400);
    expect(body(e).message).toContain('max_tokens');
  });

  it.each([
    ['Anthropic', 529, FIXTURES.anthropic529, 503, 'upstream_overloaded'],
    ['Google Gemini', 503, FIXTURES.gemini503, 503, 'upstream_overloaded'],
    ['Anthropic', 500, FIXTURES.anthropic500, 502, 'upstream_server_error'],
    ['OpenAI', 502, '<html><body><h1>502 Bad Gateway</h1><p>cloudflare</p></body></html>', 502, 'upstream_server_error'],
    ['Groq', 504, 'upstream request timeout', 504, 'upstream_timeout'],
    ['OpenAI', 408, '', 504, 'upstream_timeout'],
    ['OpenAI', 402, { error: { message: 'billing_hard_limit_reached' } }, 502, 'upstream_billing_error'],
    ['OpenAI', 418, 'teapot', 502, 'upstream_unexpected_status'],
  ])('%s HTTP %i → %i %s', (label, status, payload, expectedStatus, code) => {
    const e = norm(label as string, status as number, payload);
    expect(e.getStatus()).toBe(expectedStatus);
    expect(body(e).code).toBe(code);
    expect(body(e).type).toBe('upstream_provider_error');
  });

  it('never returns the raw upstream body: an HTML error page or stack-like text is not echoed', () => {
    const html = '<html><body>Traceback (most recent call last):\n  File "/srv/app.py", line 1, in <module>\nNullPointerException at com.internal.Svc.run(Svc.java:42)</body></html>';
    const e = norm('OpenAI', 500, html);
    const out = JSON.stringify(e.getResponse());
    expect(out).not.toContain('Traceback');
    expect(out).not.toContain('NullPointerException');
    expect(out).not.toContain('Svc.java');
    expect(out).not.toContain('<html>');
  });

  it('scrubs the key actually used, and known key shapes, from an echoed upstream message', () => {
    const leaky = { error: { message: `Bad request while using key ${KEYS.groq} and also Bearer abcdefghijklmnopqrstuvwxyz0123456789 plus sk-proj-ZZZZZZZZZZZZZZZZZZZZ`, code: 'x' } };
    const e = norm('Groq', 400, leaky, { apiKey: KEYS.groq });
    const out = JSON.stringify(e.getResponse());
    expect(out).not.toContain(KEYS.groq);
    expect(out).not.toContain('abcdefghijklmnopqrstuvwxyz0123456789');
    expect(out).not.toContain('sk-proj-ZZZZ');
    expect(out).toContain('REDACTED');
  });

  it('truncates a very long upstream message', () => {
    const e = norm('OpenAI', 400, { error: { message: 'x'.repeat(5000) } });
    expect(body(e).message.length).toBeLessThan(400);
  });

  it('the response carries no stack trace and survives the global exception filter as a flat error object', () => {
    const e = norm('Anthropic', 429, FIXTURES.anthropic429);
    const json = jest.fn();
    const res: any = { status: jest.fn(() => ({ json })) };
    const host: any = {
      switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ method: 'POST', url: '/v1/chat/completions', requestId: 'r1' }) }),
    };
    new GlobalHttpExceptionFilter().catch(e, host);
    expect(res.status).toHaveBeenCalledWith(429);
    const out = json.mock.calls[0][0];
    expect(out.error).toMatchObject({ type: 'upstream_provider_error', code: 'upstream_rate_limited', upstream_provider: 'Anthropic' });
    expect(JSON.stringify(out)).not.toMatch(/\bat .*\(.*:\d+:\d+\)/); // no stack frames
  });
});

describe('every adapter returns the normalized format end to end', () => {
  const cases: Array<[string, () => Promise<unknown>, string]> = [
    ['OpenAI', () => new OpenAIAdapter(pricing).execute({ projectId: 'p', model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] }, KEYS.openai), 'OpenAI'],
    ['Anthropic', () => new AnthropicAdapter(pricing).execute({ projectId: 'p', model: 'claude-sonnet-5-5', messages: [{ role: 'user', content: 'hi' }] }, KEYS.anthropic), 'Anthropic'],
    ['Gemini', () => new GeminiAdapter(pricing).execute({ projectId: 'p', model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'hi' }] }, KEYS.gemini), 'Google Gemini'],
    ['Groq', () => new GroqAdapter(pricing).execute({ projectId: 'p', model: 'openai/gpt-oss-120b', messages: [{ role: 'user', content: 'hi' }] }, KEYS.groq), 'Groq'],
  ];

  it.each(cases)('%s: provider 401 → 502 upstream_auth_failed (the fetch response carries the key back in its body)', async (_n, run, label) => {
    global.fetch = jest.fn(async () => respond(401, { error: { message: `Incorrect API key provided: ${Object.values(KEYS).join(' ')}` } })) as any;
    const e = await errorOf(run);
    expect(e.getStatus()).toBe(502);
    expect(body(e)).toMatchObject({ code: 'upstream_auth_failed', upstream_provider: label });
    for (const k of Object.values(KEYS)) expect(JSON.stringify(e.getResponse())).not.toContain(k);
  });

  it.each(cases)('%s: connection reset → 504 upstream_network_error without leaking the cause text', async (_n, run) => {
    global.fetch = jest.fn(async () => {
      throw new Error(`connect ECONNRESET https://internal-proxy.local/?key=${KEYS.openai}`);
    }) as any;
    const e = await errorOf(run);
    expect(e.getStatus()).toBe(504);
    expect(body(e).code).toBe('upstream_network_error');
    expect(JSON.stringify(e.getResponse())).not.toContain('internal-proxy.local');
    expect(JSON.stringify(e.getResponse())).not.toContain(KEYS.openai);
  });

  it('a 200 with a non-JSON body is a 502 upstream_invalid_response', async () => {
    global.fetch = jest.fn(async () => respond(200, '<html>maintenance</html>')) as any;
    const e = await errorOf(cases[0][1]);
    expect(e.getStatus()).toBe(502);
    expect(body(e).code).toBe('upstream_invalid_response');
  });
});

describe('timeout covers the whole response, not just the headers', () => {
  const post = () =>
    postProviderJson({ providerLabel: 'OpenAI', url: 'http://upstream.test/v1/chat/completions', headers: {}, body: {}, apiKey: KEYS.openai });

  /** A fetch whose headers arrive immediately but whose body never completes (until aborted). */
  const stallingBody = () =>
    jest.fn(async (_url: string, init: any) => {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () =>
          new Promise<string>((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })));
          }),
      } as any;
    });

  it('headers fast + body stalled → aborted at the deadline with 504 upstream_timeout (previously hung until the hold expired)', async () => {
    process.env.GATEWAY_PROXY_TIMEOUT_MS = '60';
    global.fetch = stallingBody() as any;
    const started = Date.now();
    const e = await errorOf(post);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(e.getStatus()).toBe(504);
    expect(body(e)).toMatchObject({ code: 'upstream_timeout', upstream_provider: 'OpenAI' });
  });

  it('a stalled ERROR body is also bounded (the error text is read inside the deadline)', async () => {
    process.env.GATEWAY_PROXY_TIMEOUT_MS = '60';
    const f = stallingBody();
    global.fetch = (async (u: string, i: any) => ({ ...(await f(u, i)), ok: false, status: 500 })) as any;
    const e = await errorOf(post);
    expect(e.getStatus()).toBe(504);
    expect(body(e).code).toBe('upstream_timeout');
  });

  it('a normal fast response is unaffected and the timer does not keep running', async () => {
    process.env.GATEWAY_PROXY_TIMEOUT_MS = '5000';
    global.fetch = jest.fn(async () => respond(200, { ok: true })) as any;
    await expect(post()).resolves.toEqual({ ok: true });
  });
});

describe('scrubSecrets', () => {
  it('redacts provider keys, SpendGuard keys and bearer tokens', () => {
    const text = `a ${KEYS.openai} b ${KEYS.anthropic} c ${KEYS.gemini} d ${KEYS.groq} e sg_live_0123456789abcdef0123 f Bearer abcdefghijklmnopqrstuvwxyz1234`;
    const out = scrubSecrets(text);
    for (const k of [...Object.values(KEYS), 'sg_live_0123456789abcdef0123', 'abcdefghijklmnopqrstuvwxyz1234']) expect(out).not.toContain(k);
  });
  it('ignores very short "secrets" so ordinary words are not shredded', () => {
    expect(scrubSecrets('the cat sat', ['cat'])).toBe('the cat sat');
  });
});
