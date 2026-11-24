import 'reflect-metadata';
import { HttpException } from '@nestjs/common';
import { GatewayService } from '../src/modules/gateway/gateway.service';
import { RequestLedgerProcessor } from '../src/modules/gateway/request-ledger.processor';
import { PERSIST_ATTEMPT_JOB } from '../src/modules/gateway/request-ledger.queue';
import { AuditService } from '../src/modules/audit/audit.service';
import { AuditController } from '../src/modules/audit/audit.controller';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { normalizeUpstreamError } from '../src/modules/gateway/adapters/provider-http';
import { missingProviderKeyError } from '../src/modules/gateway/adapters/provider-key.util';
import { FakeDb } from './helpers/fakes';

const pricing = new PricingService({ modelPricing: { findMany: async () => [] } } as any, { getCache: async () => null } as any);

const SECRET_PROMPT = 'my SSN is 078-05-1120 and the launch code is HUNTER2-TANGO';
const PROVIDER_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';

function harness(adapterError: unknown, opts: { orgId?: string | null; db?: FakeDb } = {}) {
  const db = opts.db ?? new FakeDb();
  const calls: string[] = [];
  const prisma: any = {
    providerApiKey: { findFirst: async () => ({ id: 'pk', encryptedKey: 'enc' }), update: async () => ({}) },
    project: { findUnique: jest.fn(async ({ where }: any) => ({ orgId: where.id === 'proj-a' ? 'org-a' : 'org-b' })) },
    request: { create: jest.fn(async () => ({})), findMany: jest.fn() },
    requestAttempt: { create: jest.fn((a: any) => db.requestAttempt.create(a)) },
  };
  const budget: any = {
    reserveCapacity: jest.fn(async (_p: string, requestId: string, amount: number) => ({
      canProceed: true, isHardBlocked: false, budgetMonthly: 100, currentMonthlySpend: 0, utilizationPct: 0, hold: { requestId, amount, buckets: [] }, logRequestContent: true,
    })),
    settleHold: jest.fn(),
    releaseHold: jest.fn(async () => { calls.push('release'); }),
    markPendingPersist: jest.fn(),
    clearPendingPersist: jest.fn(),
    evaluatePostRequestThresholds: jest.fn(),
  };
  const redis: any = { reserveTpm: async () => ({ allowed: true, counterKey: 'k', count: 0 }), adjustTpm: jest.fn(async () => { calls.push('tpm-release'); }) };
  const adapter: any = { execute: jest.fn(async () => { throw adapterError; }) };
  const ledgerQueue: any = { add: jest.fn(async () => ({})) };
  const anomalyQueue: any = { add: jest.fn(() => Promise.resolve({})) };
  const enc: any = { decryptApiKey: () => PROVIDER_KEY };
  const svc = new GatewayService(prisma, redis, budget, pricing, enc, adapter, adapter, adapter, adapter, ledgerQueue, anomalyQueue);
  const req = (extra: any = {}) => ({
    projectId: 'proj-a',
    ...(opts.orgId === null ? {} : { orgId: opts.orgId ?? 'org-a' }),
    model: 'gpt-4o',
    messages: [{ role: 'user' as const, content: SECRET_PROMPT }],
    maxTokens: 300,
    clientIp: '203.0.113.9',
    clientSdk: 'curl/8.0',
    gatewayKey: { id: 'gk-1', budgetMonthly: null, rateLimitTpm: 100000 },
    ...extra,
  });
  return { svc, db, prisma, budget, redis, ledgerQueue, anomalyQueue, req, calls };
}

const upstream = (status: number, body: unknown = { error: { message: 'x', code: 'some_code' } }, apiKey = PROVIDER_KEY) =>
  normalizeUpstreamError({ providerLabel: 'OpenAI', status, rawBody: JSON.stringify(body), apiKey });
const fail = (p: Promise<unknown>) => p.then(() => { throw new Error('expected failure'); }, (e) => e as HttpException);

describe('failed upstream calls are audited in request_attempts', () => {
  it('records every field the audit needs, with the error classification and upstream status', async () => {
    const h = harness(upstream(429, { error: { message: 'Rate limit reached', code: 'rate_limit_exceeded' } }));
    const before = Date.now();
    const e = await fail(h.svc.processChatCompletion(h.req()));
    expect(e.getStatus()).toBe(429);

    expect(h.db.attempts).toHaveLength(1);
    const a = h.db.attempts[0];
    expect(a).toMatchObject({
      orgId: 'org-a',
      projectId: 'proj-a',
      gatewayKeyId: 'gk-1',
      provider: 'OPENAI',
      model: 'gpt-4o',
      errorClass: 'upstream_rate_limited',
      httpStatus: 429,
      upstreamStatus: 429,
      upstreamCode: 'rate_limit_exceeded',
    });
    expect(a.id).toMatch(/^req_/);
    expect(a.durationMs).toBeGreaterThanOrEqual(0);
    expect(a.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('estimatedCostUsd is the released reservation, and NO spend is recorded anywhere', async () => {
    const h = harness(upstream(500));
    await fail(h.svc.processChatCompletion(h.req()));
    const held = h.budget.reserveCapacity.mock.calls[0][2];
    expect(h.db.attempts[0].estimatedCostUsd).toBe(held);
    expect(held).toBeGreaterThan(0);
    expect(h.budget.settleHold).not.toHaveBeenCalled(); // nothing charged
    expect(h.prisma.request.create).not.toHaveBeenCalled(); // the spend ledger is untouched
    expect(h.budget.releaseHold).toHaveBeenCalledTimes(1);
    expect(h.calls).toEqual(['release', 'tpm-release']); // reservation released BEFORE the audit write
    expect(h.anomalyQueue.add).not.toHaveBeenCalled();
  });

  it('stores NO prompt, response, credential, header or raw provider body', async () => {
    const h = harness(
      upstream(400, { error: { message: `bad request for ${SECRET_PROMPT} using ${PROVIDER_KEY}`, code: 'invalid_prompt' } }),
    );
    await fail(h.svc.processChatCompletion(h.req()));
    const stored = JSON.stringify(h.db.attempts[0]);
    for (const forbidden of [SECRET_PROMPT, 'HUNTER2', '078-05-1120', PROVIDER_KEY, 'sk-proj', 'Authorization', 'Bearer', '203.0.113.9', 'curl/8.0']) {
      expect(stored).not.toContain(forbidden);
    }
    // the whole row is short, whitelisted scalars
    expect(Object.keys(h.db.attempts[0]).sort()).toEqual(
      ['billingStatus', 'createdAt', 'durationMs', 'errorClass', 'estimatedCostUsd', 'executionStatus', 'gatewayKeyId', 'httpStatus', 'id', 'model', 'orgId', 'projectId', 'provider', 'upstreamCode', 'upstreamStatus', 'userId'].sort(),
    );
  });

  it.each([
    ['provider key rejected', upstream(401), 'upstream_auth_failed', 502, 401],
    ['timeout', new HttpException({ error: { code: 'upstream_timeout', type: 'upstream_provider_error' } }, 504), 'upstream_timeout', 504, undefined],
    ['overloaded', upstream(529), 'upstream_overloaded', 503, 529],
    ['missing provider key (no upstream call was made)', missingProviderKeyError('OpenAI'), 'missing_provider_key', 400, undefined],
  ])('classifies %s', async (_n, err, errorClass, httpStatus, upstreamStatus) => {
    const h = harness(err);
    await fail(h.svc.processChatCompletion(h.req()));
    expect(h.db.attempts[0]).toMatchObject({ errorClass, httpStatus, upstreamStatus: upstreamStatus ?? null });
  });

  it('an unexpected crash is internal_error/500 and still audited; the caller gets the ORIGINAL error', async () => {
    const boom = new TypeError('cannot read properties of undefined');
    const h = harness(boom);
    const e = await h.svc.processChatCompletion(h.req()).catch((x) => x);
    expect(e).toBe(boom);
    expect(h.db.attempts[0]).toMatchObject({ errorClass: 'internal_error', httpStatus: 500, upstreamStatus: null });
    expect(JSON.stringify(h.db.attempts[0])).not.toContain('undefined');
  });

  it('a dashboard-session call is attributed to the user; a key call to the key', async () => {
    const h = harness(upstream(500));
    await fail(h.svc.processChatCompletion(h.req({ userId: 'user-7', gatewayKey: undefined })));
    expect(h.db.attempts[0]).toMatchObject({ userId: 'user-7', gatewayKeyId: null });
  });
});

describe('organization attribution', () => {
  it('uses the org resolved at the controller; falls back to the project\'s org when absent', async () => {
    const withOrg = harness(upstream(500));
    await fail(withOrg.svc.processChatCompletion(withOrg.req()));
    expect(withOrg.prisma.project.findUnique).not.toHaveBeenCalled();

    const without = harness(upstream(500), { orgId: null });
    await fail(without.svc.processChatCompletion(without.req()));
    expect(without.prisma.project.findUnique).toHaveBeenCalledWith({ where: { id: 'proj-a' }, select: { orgId: true } });
    expect(without.db.attempts[0].orgId).toBe('org-a');
  });

  it('a project with no organization is logged, not written with a guessed org', async () => {
    const h = harness(upstream(500), { orgId: null });
    h.prisma.project.findUnique.mockResolvedValue(null);
    await fail(h.svc.processChatCompletion(h.req()));
    expect(h.db.attempts).toHaveLength(0);
  });
});

describe('the audit write can never change what the caller sees', () => {
  it('DB failure → the row is queued for retry (same queue and retry policy as the ledger) and the original error is still thrown', async () => {
    const original = upstream(401);
    const h = harness(original);
    h.prisma.requestAttempt.create.mockRejectedValue(Object.assign(new Error('db down'), { code: 'P1001' }));
    const e = await h.svc.processChatCompletion(h.req()).catch((x) => x);
    expect(e).toBe(original);
    expect(h.ledgerQueue.add).toHaveBeenCalledTimes(1);
    const [name, row, opts] = h.ledgerQueue.add.mock.calls[0];
    expect(name).toBe(PERSIST_ATTEMPT_JOB);
    expect(opts.jobId).toBe(`attempt-${row.id}`);
    expect(opts.attempts).toBeGreaterThanOrEqual(10);
    expect(JSON.stringify(row)).not.toContain(SECRET_PROMPT);
  });

  it('DB and retry queue both down → still the original error; the event is logged once as a secret-free structured line', async () => {
    const h = harness(upstream(401));
    h.prisma.requestAttempt.create.mockRejectedValue(new Error('db down'));
    h.ledgerQueue.add.mockRejectedValue(new Error('queue down'));
    const spy = jest.spyOn((h.svc as any).logger, 'error').mockImplementation(() => undefined);
    const e = await fail(h.svc.processChatCompletion(h.req()));
    expect(e.getStatus()).toBe(502);
    const critical = spy.mock.calls.map((c) => String(c[0])).find((m) => m.startsWith('CRITICAL: could not queue attempt retry'));
    expect(critical).toBeDefined();
    expect(critical).not.toContain(SECRET_PROMPT);
    expect(critical).not.toContain(PROVIDER_KEY);
    spy.mockRestore();
  });

  it('a duplicate insert (P2002, e.g. an earlier attempt actually committed) is ignored quietly', async () => {
    const h = harness(upstream(500));
    h.prisma.requestAttempt.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await fail(h.svc.processChatCompletion(h.req()));
    expect(h.ledgerQueue.add).not.toHaveBeenCalled();
  });

  it('a throwing org lookup is swallowed (auditing is best effort for the caller, durable for the system)', async () => {
    const original = upstream(500);
    const h = harness(original, { orgId: null });
    h.prisma.project.findUnique.mockRejectedValue(new Error('db down'));
    await expect(h.svc.processChatCompletion(h.req())).rejects.toBe(original);
  });
});

describe('persist-attempt retry job', () => {
  const row = { id: 'req_1', orgId: 'org-a', projectId: 'proj-a', gatewayKeyId: null, userId: null, provider: 'OPENAI', model: 'gpt-4o', errorClass: 'upstream_timeout', httpStatus: 504, upstreamStatus: null, upstreamCode: null, estimatedCostUsd: 0.01, durationMs: 60000, createdAt: '2026-11-24T10:00:00.000Z' };
  const mk = (create: any) => new RequestLedgerProcessor({ requestAttempt: { create }, request: { create: jest.fn() } } as any, { clearPendingPersist: jest.fn() } as any);
  const job = (data: any = row, attemptsMade = 0): any => ({ name: PERSIST_ATTEMPT_JOB, data, attemptsMade });

  it('persists the row with a real Date and does not touch the spend ledger or pending-persist state', async () => {
    const create = jest.fn(async () => ({}));
    const p = mk(create);
    await p.process(job());
    expect((create.mock.calls[0] as any)[0].data.createdAt).toEqual(new Date(row.createdAt));
    expect((p as any).prisma.request.create).not.toHaveBeenCalled();
    expect((p as any).budgetService.clearPendingPersist).not.toHaveBeenCalled();
  });

  it('is idempotent on a duplicate and rethrows other failures so BullMQ retries', async () => {
    await expect(mk(jest.fn().mockRejectedValue(Object.assign(new Error('u'), { code: 'P2002' }))).process(job())).resolves.toBeUndefined();
    await expect(mk(jest.fn().mockRejectedValue(Object.assign(new Error('x'), { code: 'P1001' }))).process(job())).rejects.toThrow('x');
  });

  it('other job names still go through the spend-ledger path', async () => {
    const create = jest.fn(async () => ({}));
    const p = mk(create);
    await p.process({ name: 'persist-request', data: { id: 'req_9', projectId: 'p', createdAt: '2026-11-24T10:00:00.000Z' }, attemptsMade: 0 } as any);
    expect((p as any).prisma.request.create).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('reading failed attempts is tenant-scoped', () => {
  const seed = () => {
    const db = new FakeDb();
    const mkRow = (id: string, orgId: string, projectId: string, extra: any = {}) => ({
      id, orgId, projectId, gatewayKeyId: 'gk', provider: 'OPENAI', model: 'gpt-4o', errorClass: 'upstream_timeout', httpStatus: 504, upstreamStatus: null,
      upstreamCode: null, estimatedCostUsd: 0.01, durationMs: 100, createdAt: new Date(Date.parse('2026-11-24T10:00:00Z') + db.attempts.length * 1000), ...extra,
    });
    db.attempts.push(mkRow('a1', 'org-a', 'proj-a'), mkRow('a2', 'org-a', 'proj-a', { errorClass: 'upstream_auth_failed' }), mkRow('b1', 'org-b', 'proj-b'));
    return db;
  };
  const svc = (db: FakeDb) => new AuditService(db as any);

  it("org A sees only org A's rows, and cannot reach org B's by passing B's project id", async () => {
    const s = svc(seed());
    const own = await s.listAttempts({ orgId: 'org-a' });
    expect(own.attempts.map((a) => a.id).sort()).toEqual(['a1', 'a2']);
    expect(own.total).toBe(2);
    const probe = await s.listAttempts({ orgId: 'org-a', projectId: 'proj-b' });
    expect(probe).toMatchObject({ attempts: [], total: 0 });
    expect((await s.listAttempts({ orgId: 'org-b' })).attempts.map((a) => a.id)).toEqual(['b1']);
  });

  it('filters by error class; returns spend-free, content-free fields only', async () => {
    const s = svc(seed());
    const out = await s.listAttempts({ orgId: 'org-a', errorClass: 'upstream_auth_failed' });
    expect(out.attempts).toHaveLength(1);
    expect(Object.keys(out.attempts[0]).sort()).toEqual(
      ['billingStatus', 'durationMs', 'errorClass', 'estimatedCostUsd', 'executionStatus', 'gatewayKeyId', 'httpStatus', 'id', 'model', 'projectId', 'projectName', 'provider', 'reconciledAt', 'reconciledCostUsd', 'reconciledStatus', 'timestamp', 'upstreamCode', 'upstreamStatus'].sort(),
    );
  });

  it('the HTTP route always scopes to the caller\'s own organization and clamps paging', async () => {
    const listAttempts = jest.fn(async () => ({ attempts: [], total: 0 }));
    const controller = new AuditController({ listAttempts } as any);
    await controller.getAttempts({ orgId: 'org-a', role: 'MEMBER' } as any, 'proj-b', undefined, undefined, undefined, undefined, undefined, '99999', '-5');
    expect(listAttempts).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org-a', projectId: 'proj-b', limit: 500, offset: 0 }));
    await expect(controller.getAttempts({ orgId: 'org-a' } as any, undefined, undefined, undefined, undefined, 'not-a-date')).rejects.toThrow('startDate');
  });
});
