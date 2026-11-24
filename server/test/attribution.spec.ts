import 'reflect-metadata';
import { resolveAttribution, MAX_CUSTOM_TAGS } from '../src/modules/gateway/attribution';
import { GatewayController } from '../src/modules/gateway/gateway.controller';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { harness, request } from './helpers/gateway-harness';

describe('attribution: nothing is guessed', () => {
  it('no key assignment and no headers → every dimension is null (unattributed), tags null', () => {
    expect(resolveAttribution({})).toMatchObject({ application: null, team: null, tags: null, sources: { application: null, team: null }, ignored: [] });
  });

  it('headers fill the dimensions and are normalised (trim, lower-case) so "Support-Bot" and "support-bot" are one application', () => {
    const a = resolveAttribution({ headerApplication: '  Support-Bot ', headerTeam: 'Growth' });
    expect(a).toMatchObject({ application: 'support-bot', team: 'growth', sources: { application: 'header', team: 'header' } });
  });

  it('a gateway-key assignment is AUTHORITATIVE: a header naming another team is ignored and reported', () => {
    const a = resolveAttribution({ keyTeam: 'platform', headerTeam: 'finance', headerApplication: 'batch-jobs' });
    expect(a.team).toBe('platform');
    expect(a.sources).toEqual({ application: 'header', team: 'key' });
    expect(a.ignored.join(' ')).toMatch(/team header ignored: the gateway key is assigned to "platform"/);
  });

  it('a header equal to the key assignment is not an "ignored" event', () => {
    expect(resolveAttribution({ keyTeam: 'platform', headerTeam: 'PLATFORM' }).ignored).toEqual([]);
  });

  it('an invalid value is dropped, never repaired or defaulted, and never fails the request', () => {
    for (const bad of ['has space', '-leading', 'x'.repeat(65), 'semi;colon', '<script>', 'ünïcode']) {
      const a = resolveAttribution({ headerApplication: bad });
      expect(a.application).toBeNull();
      expect(a.ignored.length).toBe(1);
    }
  });

  it('accepts the documented character set', () => {
    expect(resolveAttribution({ headerApplication: 'svc.v2:eu-west_1' }).application).toBe('svc.v2:eu-west_1');
  });

  it('an array header (repeated header) uses the first value', () => {
    expect(resolveAttribution({ headerApplication: ['a', 'b'] }).application).toBe('a');
  });
});

describe('attribution: extensible tags', () => {
  it('parses key=value pairs', () => {
    expect(resolveAttribution({ headerTags: 'env=prod, Feature=Search' }).tags).toEqual({ env: 'prod', feature: 'search' });
  });
  it('keeps at most 5 tags and reports the rest', () => {
    const a = resolveAttribution({ headerTags: 'a=1,b=2,c=3,d=4,e=5,f=6' });
    expect(Object.keys(a.tags!)).toHaveLength(MAX_CUSTOM_TAGS);
    expect(a.ignored.join(' ')).toMatch(/at most 5/);
  });
  it('drops malformed pairs but keeps the valid ones', () => {
    const a = resolveAttribution({ headerTags: 'env=prod,novalue,=x,BAD KEY=1,ok=yes' });
    expect(a.tags).toEqual({ env: 'prod', ok: 'yes' });
    expect(a.ignored).toHaveLength(3);
  });
  it('application/team inside the tag list are rejected in favour of the dedicated headers (one source of truth)', () => {
    const a = resolveAttribution({ headerTags: 'team=finance,env=prod' });
    expect(a.team).toBeNull();
    expect(a.tags).toEqual({ env: 'prod' });
    expect(a.ignored.join(' ')).toMatch(/X-SpendGuard-Team/);
  });
  it('a pathological header is bounded (no unbounded work)', () => {
    const started = Date.now();
    const a = resolveAttribution({ headerTags: 'k=v,'.repeat(100_000) });
    expect(Date.now() - started).toBeLessThan(500);
    expect(Object.keys(a.tags ?? {}).length).toBeLessThanOrEqual(MAX_CUSTOM_TAGS);
  });
});

describe('attribution reaches the ledger exactly as resolved', () => {
  it('the gateway writes application, team, tags, cached tokens and the SOURCE of each dimension', async () => {
    const h = harness({ adapterResult: { responseText: 'x', promptTokens: 100, completionTokens: 10, totalTokens: 110, isSimulated: false, cachedPromptTokens: 40 } });
    await h.service.processChatCompletion(
      request({ attribution: { application: 'support-bot', team: 'platform', tags: { env: 'prod' }, sources: { application: 'header', team: 'key' } } }),
    );
    const data = h.prisma.request.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ application: 'support-bot', team: 'platform', tags: { env: 'prod' }, cachedTokensIn: 40 });
    expect(JSON.parse(data.metadataJson).attribution).toEqual({ application: 'header', team: 'key' });
  });

  it('a request with no attribution is stored with NULLs (not "unknown", not "default")', async () => {
    const h = harness();
    await h.service.processChatCompletion(request());
    const data = h.prisma.request.create.mock.calls[0][0].data;
    expect(data.application).toBeNull();
    expect(data.team).toBeNull();
    expect(data.tags).toBeUndefined();
    expect(data.cachedTokensIn).toBeNull(); // the provider reported no cache data: stored as "not recorded", not 0
  });
});

describe('the controller applies the precedence rule end to end', () => {
  const pricing = new PricingService({ modelPricing: { findMany: async () => [] } } as any, { getCache: async () => null } as any);
  const build = (key: any) => {
    const processChatCompletion = jest.fn(async () => ({ headers: {} }));
    const prisma: any = { gatewayApiKey: { findUnique: async () => key, update: async () => ({}) }, project: { findFirst: async () => null } };
    const controller = new GatewayController({ processChatCompletion } as any, prisma, { hashToken: (t: string) => t } as any, pricing, { getClient: () => null } as any, {} as any);
    return { controller, processChatCompletion };
  };
  const res = () => { const r: any = { setHeader: jest.fn(), status: jest.fn(() => r), json: jest.fn() }; return r; };
  const key = { id: 'k', projectId: 'p', isActive: true, expiresAt: null, allowedModels: null, allowedProviders: null, rateLimitRpm: 0, rateLimitTpm: null, budgetMonthly: null, project: { orgId: 'o' }, application: null, team: 'platform' };
  const body = { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] };

  it('key team wins over the header; the header application is used; an ignored header is reported to the caller', async () => {
    const { controller, processChatCompletion } = build(key);
    const r = res();
    await controller.createChatCompletion(body as any, 'Bearer sg_live_x', '', '', '', { ip: '1.1.1.1', socket: {}, headers: { 'x-spendguard-team': 'finance', 'x-spendguard-application': 'Batch-Jobs' } } as any, r);
    const arg = (processChatCompletion.mock.calls[0] as any[])[0];
    expect(arg.attribution).toMatchObject({ application: 'batch-jobs', team: 'platform', sources: { application: 'header', team: 'key' } });
    expect(r.setHeader).toHaveBeenCalledWith('X-SpendGuard-Attribution-Ignored', expect.stringMatching(/team header ignored/));
  });

  it('no header noise: when nothing was ignored the response carries no attribution header', async () => {
    const { controller } = build({ ...key, team: null });
    const r = res();
    await controller.createChatCompletion(body as any, 'Bearer sg_live_x', '', '', '', { ip: '1.1.1.1', socket: {}, headers: {} } as any, r);
    expect(r.setHeader).not.toHaveBeenCalledWith('X-SpendGuard-Attribution-Ignored', expect.anything());
  });
});

describe('dashboard-session (Playground) attribution policy', () => {
  it('with no key and no header, the server attributes the application as the playground, source "session"', () => {
    const a = resolveAttribution({ sessionDefaultApplication: 'dashboard-playground' });
    expect(a).toMatchObject({ application: 'dashboard-playground', team: null, sources: { application: 'session', team: null }, ignored: [] });
  });
  it('a valid header from the session user wins over the default (same rules as the gateway)', () => {
    const a = resolveAttribution({ headerApplication: 'Checkout-Test', headerTeam: 'Growth', sessionDefaultApplication: 'dashboard-playground' });
    expect(a).toMatchObject({ application: 'checkout-test', team: 'growth', sources: { application: 'header', team: 'header' } });
  });
  it('an invalid header is reported and replaced by the server default, never by the invalid text', () => {
    const a = resolveAttribution({ headerApplication: '<script>', sessionDefaultApplication: 'dashboard-playground' });
    expect(a.application).toBe('dashboard-playground');
    expect(a.ignored.join()).toMatch(/application header ignored/);
  });
  it('a gateway key assignment still beats the session default; the default never applies to team', () => {
    const a = resolveAttribution({ keyApplication: 'billing', sessionDefaultApplication: 'dashboard-playground' });
    expect(a).toMatchObject({ application: 'billing', sources: { application: 'key' } });
    expect(resolveAttribution({ sessionDefaultApplication: 'x' }).team).toBeNull();
  });
  it('without the option nothing changes: unattributed stays unattributed', () => {
    expect(resolveAttribution({})).toMatchObject({ application: null, team: null });
  });
});

describe('the controller attributes a dashboard session, but never a gateway key, as the playground', () => {
  const pricing = new PricingService({ modelPricing: { findMany: async () => [] } } as any, { getCache: async () => null } as any);
  const build = (key: any) => {
    const processChatCompletion = jest.fn(async () => ({ headers: {} }));
    const prisma: any = { gatewayApiKey: { findUnique: async () => key, update: async () => ({}) }, project: { findFirst: async ({ where }: any) => (where.orgId === 'org-a' ? { id: where.id } : null) } };
    const auth: any = { verifyAccessToken: async (t: string) => (t === 'jwt-a' ? { id: 'u1', orgId: 'org-a' } : null) };
    const controller = new GatewayController({ processChatCompletion } as any, prisma, { hashToken: (t: string) => t } as any, pricing, { getClient: () => null } as any, auth);
    return { controller, processChatCompletion };
  };
  const res = () => { const r: any = { setHeader: jest.fn(), status: jest.fn(() => r), json: jest.fn() }; return r; };
  const body = { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }], projectId: 'p1' };

  it('a session request with no headers is attributed to "dashboard-playground"', async () => {
    const { controller, processChatCompletion } = build(null);
    await controller.createChatCompletion(body as any, 'Bearer jwt-a', '', '', '', { ip: '1.1.1.1', socket: {}, headers: {} } as any, res());
    expect((processChatCompletion.mock.calls[0] as any[])[0].attribution).toMatchObject({ application: 'dashboard-playground', sources: { application: 'session' } });
  });
  it('forwarded headers from the proxy are honoured for a session, with the same validation', async () => {
    const { controller, processChatCompletion } = build(null);
    await controller.createChatCompletion(body as any, 'Bearer jwt-a', '', '', '', { ip: '1.1.1.1', socket: {}, headers: { 'x-spendguard-application': 'Pricing-Page', 'x-spendguard-team': 'Growth', 'x-spendguard-tags': 'env=staging' } } as any, res());
    expect((processChatCompletion.mock.calls[0] as any[])[0].attribution).toMatchObject({ application: 'pricing-page', team: 'growth', tags: { env: 'staging' } });
  });
  it('an unauthenticated session reaches neither attribution nor the service', async () => {
    const { controller, processChatCompletion } = build(null);
    await expect(controller.createChatCompletion(body as any, 'Bearer nope', '', '', '', { ip: '1', socket: {}, headers: { 'x-spendguard-application': 'x' } } as any, res())).rejects.toBeDefined();
    expect(processChatCompletion).not.toHaveBeenCalled();
  });
  it('a gateway-key request with no assignment and no headers stays unattributed (the default is for sessions only)', async () => {
    const key = { id: 'k', projectId: 'p', isActive: true, expiresAt: null, allowedModels: null, allowedProviders: null, rateLimitRpm: 0, rateLimitTpm: null, budgetMonthly: null, project: { orgId: 'o' }, application: null, team: null };
    const { controller, processChatCompletion } = build(key);
    await controller.createChatCompletion({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] } as any, 'Bearer sg_live_x', '', '', '', { ip: '1', socket: {}, headers: {} } as any, res());
    expect((processChatCompletion.mock.calls[0] as any[])[0].attribution).toMatchObject({ application: null, sources: { application: null } });
  });
});
