import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { HttpException } from '@nestjs/common';
import { GroqAdapter } from '../src/modules/gateway/adapters/groq.adapter';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { PRICING_CATALOG } from '../src/modules/pricing/pricing.catalog';
import { CreateKeyDto } from '../src/modules/keys/keys.dto';
import { KeysService } from '../src/modules/keys/keys.service';
import { FetchLike, fetchProviderModels, formatSyncReport, syncModelCatalog, PROVIDERS } from '../src/modules/pricing/model-catalog.sync';

const redis: any = { isConnected: false, getClient: () => null };
const pricing = new PricingService({ modelPricing: { findMany: async () => [] } } as any, redis);
const adapter = new GroqAdapter(pricing);

const req = (model = 'openai/gpt-oss-120b') => ({
  projectId: 'p1',
  model,
  messages: [{ role: 'user' as const, content: 'hello' }],
  maxTokens: 50,
});

const env = { ...process.env };
const realFetch = global.fetch;
afterEach(() => {
  process.env = { ...env };
  global.fetch = realFetch;
});

const errorOf = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    return e as HttpException;
  }
  throw new Error('expected a throw');
};

describe('8.1 Groq adapter: only the tenant key, never the platform key', () => {
  it('no tenant key → 400 missing_provider_key and ZERO upstream calls', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    process.env.GROQ_API_KEY = 'gsk_platform_key_that_must_never_be_used';
    process.env.NODE_ENV = 'development'; // even in dev, the opt-in flag is off

    const e = await errorOf(() => adapter.execute(req(), undefined));

    expect(e.getStatus()).toBe(400);
    expect((e.getResponse() as any).error.code).toBe('missing_provider_key');
    expect((e.getResponse() as any).error.message).toContain('Groq');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('platform key in production is never used, even with the opt-in flag', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    process.env.GROQ_API_KEY = 'gsk_platform_key_that_must_never_be_used';
    process.env.ALLOW_PLATFORM_PROVIDER_KEY = 'true';
    process.env.NODE_ENV = 'production';

    const e = await errorOf(() => adapter.execute(req(), undefined));
    expect((e.getResponse() as any).error.code).toBe('missing_provider_key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a key that is not a Groq key (gsk_...) is treated as missing, not sent upstream', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    const e = await errorOf(() => adapter.execute(req(), 'sk-an-openai-key'));
    expect((e.getResponse() as any).error.code).toBe('missing_provider_key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('with the tenant key: calls Groq with Bearer auth and maps usage', async () => {
    const fetchMock = jest.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'hi from groq' } }], usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 } }),
        { status: 200 },
      ),
    );
    global.fetch = fetchMock as any;

    const out = await adapter.execute(req(), 'gsk_tenant_key');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, any];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer gsk_tenant_key');
    // max_tokens is deprecated at Groq; max_completion_tokens is the documented limit (see docs/BUDGET_ENFORCEMENT_AND_PROVIDER_CONTRACTS.md)
    expect(JSON.parse(init.body)).toMatchObject({ model: 'openai/gpt-oss-120b', max_completion_tokens: 50 });
    expect(JSON.parse(init.body)).not.toHaveProperty('max_tokens');
    expect(out).toMatchObject({ responseText: 'hi from groq', promptTokens: 12, completionTokens: 5, totalTokens: 17, isSimulated: false });
  });

  it('GROQ_BASE_URL overrides the endpoint', async () => {
    process.env.GROQ_BASE_URL = 'http://localhost:4555/v1/';
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), { status: 200 }));
    global.fetch = fetchMock as any;
    await adapter.execute(req(), 'gsk_tenant_key');
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('http://localhost:4555/v1/chat/completions');
  });
});

describe('8.3 Groq limits are Groq\'s own: an upstream 429 passes through as a 429', () => {
  it('429 from Groq → HttpException 429 in the normalized upstream format, keeping Groq\'s own code (so the gateway releases the hold)', async () => {
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'Rate limit reached for model on tokens per minute (TPM)', type: 'tokens', code: 'rate_limit_exceeded' } }), { status: 429 }),
    ) as any;
    const e = await errorOf(() => adapter.execute(req(), 'gsk_tenant_key'));
    expect(e.getStatus()).toBe(429);
    // SpendGuard's code says whose limit it was; Groq's own code is kept as upstream_code
    expect((e.getResponse() as any).error).toMatchObject({
      type: 'upstream_provider_error',
      code: 'upstream_rate_limited',
      upstream_provider: 'Groq',
      upstream_code: 'rate_limit_exceeded',
    });
  });

  it('a network failure is a 504, not a crash', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNRESET');
    }) as any;
    const e = await errorOf(() => adapter.execute(req(), 'gsk_tenant_key'));
    expect(e.getStatus()).toBe(504);
  });
});

describe('8.2 Groq pricing and routing', () => {
  it('priced Groq models are in the catalog and route to GROQ, not OpenAI', () => {
    for (const model of ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']) {
      expect(PRICING_CATALOG[model].provider).toBe('GROQ');
      expect(pricing.isModelPriced(model)).toBe(true);
      expect(pricing.resolveProvider(model)).toBe('GROQ');
    }
  });

  it('costs use the confirmed rates ($0.15/$0.60 and $0.075/$0.30 per 1M tokens)', () => {
    expect(pricing.calculateCost('openai/gpt-oss-120b', 1_000_000, 1_000_000)).toBe(0.75);
    expect(pricing.calculateCost('openai/gpt-oss-20b', 1_000_000, 1_000_000)).toBe(0.375);
  });

  it('an unpriced Groq model is rejected with model_not_priced (never billed at another rate)', () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (e: any) {
        return e.getResponse().error.code;
      }
    };
    // Served by Groq, but its price was not published on the model page, so it is not in the table
    expect(pricing.isModelPriced('llama-3.3-70b-versatile')).toBe(false);
    expect(code(() => pricing.calculateCost('llama-3.3-70b-versatile', 1000, 1000))).toBe('model_not_priced');
    expect(code(() => pricing.estimateMaxCost('llama-3.1-8b-instant', 1000, 1000))).toBe('model_not_priced');
    expect(code(() => pricing.calculateCost('groq/imaginary-model', 1000, 1000))).toBe('model_not_priced');
  });

  it('a new Groq model id routes to GROQ by prefix once someone prices it; other providers are unchanged', () => {
    expect(pricing.resolveProvider('llama-3.3-70b-versatile')).toBe('GROQ');
    expect(pricing.resolveProvider('qwen/qwen3-32b')).toBe('GROQ');
    expect(pricing.resolveProvider('gpt-4o')).toBe('OPENAI');
    expect(pricing.resolveProvider('claude-sonnet-5-5')).toBe('ANTHROPIC');
    expect(pricing.resolveProvider('gemini-3.8-flash')).toBe('GEMINI');
  });
});

describe('8.4 Groq models come from Groq\'s models endpoint, not a typed list', () => {
  const groqFetch = (body: unknown): FetchLike => async () => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => '',
  });

  it('lists model ids from GET /openai/v1/models and skips ones Groq marks inactive', async () => {
    let calledUrl = '';
    let calledAuth = '';
    const f: FetchLike = async (url, init) => {
      calledUrl = url;
      calledAuth = init?.headers?.Authorization;
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'openai/gpt-oss-120b', active: true }, { id: 'old-model', active: false }, { id: 'llama-3.3-70b-versatile' }] }), text: async () => '' };
    };
    const models = await fetchProviderModels('GROQ', 'gsk_x', f);
    expect(calledUrl).toBe('https://api.groq.com/openai/v1/models');
    expect(calledAuth).toBe('Bearer gsk_x');
    expect(models.map((m) => m.id)).toEqual(['openai/gpt-oss-120b', 'llama-3.3-70b-versatile']);
  });

  it('the daily sync checks Groq too: flags a priced model Groq no longer lists, skips without a key', async () => {
    expect(PROVIDERS).toContain('GROQ');
    const updates: any[] = [];
    const db: any = {
      modelPricing: {
        findMany: async ({ where }: any) =>
          where.provider === 'GROQ' ? [{ id: 'r1', model: 'openai/gpt-oss-120b' }, { id: 'r2', model: 'openai/gpt-oss-20b' }] : [],
        update: async (a: any) => updates.push(a),
      },
    };

    const skipped = await syncModelCatalog(db, { env: {} as any });
    expect(skipped.find((r) => r.provider === 'GROQ')).toMatchObject({ status: 'skipped', reason: 'MODEL_CATALOG_GROQ_API_KEY not set' });

    const res = await syncModelCatalog(db, {
      env: { MODEL_CATALOG_GROQ_API_KEY: 'gsk_x' } as any,
      fetchImpl: groqFetch({ data: [{ id: 'openai/gpt-oss-120b' }] }),
    });
    const groq = res.find((r) => r.provider === 'GROQ')!;
    expect(groq).toMatchObject({ status: 'ok', checked: 2, missing: ['openai/gpt-oss-20b'] });
    expect(updates.find((u) => u.where.id === 'r2').data.providerStatus).toBe('missing');
    expect(formatSyncReport(res)).toContain('openai/gpt-oss-20b');
  });
});

describe('8.1/8.6 Groq keys use the same storage and validation as the other providers', () => {
  const base = { type: 'PROVIDER', projectId: '3c66dcd5-9588-479c-ac9d-83c024ad1032', keyName: 'Groq Primary Key', plainKey: 'gsk_x' };
  const errors = async (body: Record<string, unknown>) =>
    (await validate(plainToInstance(CreateKeyDto, body), { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property);

  it('GROQ is an accepted provider; an unknown one is not', async () => {
    expect(await errors({ ...base, provider: 'GROQ' })).toEqual([]);
    expect(await errors({ ...base, provider: 'BANANA' })).toContain('provider');
  });

  it('storing a Groq key encrypts it with the shared EncryptionService (no plaintext stored)', async () => {
    const created: any[] = [];
    const prisma: any = {
      project: { findFirst: async () => ({ id: base.projectId }) },
      providerApiKey: { create: async ({ data }: any) => (created.push(data), { id: 'k1', createdAt: new Date(), ...data }) },
    };
    const encryption: any = {
      encryptApiKey: jest.fn((k: string) => `enc:${Buffer.from(k).toString('base64')}`),
      maskApiKey: (k: string) => `${k.slice(0, 3)}...${k.slice(-4)}`,
    };
    const svc = new KeysService(prisma, encryption, {} as any);

    const res: any = await svc.storeProviderKey({ projectId: base.projectId, provider: 'GROQ', keyName: 'Groq Primary Key', plainKey: 'gsk_secret_value_1234' }, 'o1');

    expect(encryption.encryptApiKey).toHaveBeenCalledWith('gsk_secret_value_1234');
    expect(created[0].provider).toBe('GROQ');
    expect(JSON.stringify(created[0])).not.toContain('gsk_secret_value_1234');
    expect(JSON.stringify(res)).not.toContain('gsk_secret_value_1234');
  });

  it('the connection test calls Groq\'s models endpoint', async () => {
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }] }), { status: 200 }));
    global.fetch = fetchMock as any;
    const svc = new KeysService({} as any, {} as any, {} as any);
    const r: any = await svc.testProviderConnection('GROQ', 'gsk_x');
    expect(r).toMatchObject({ valid: true, modelsCount: 2 });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://api.groq.com/openai/v1/models');
  });
});
