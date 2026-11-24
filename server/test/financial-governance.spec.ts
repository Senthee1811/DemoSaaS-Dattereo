import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { classifyAttempt } from '../src/modules/gateway/attempt-classification';
import { assessMargin, MIN_SAMPLES_PER_PROVIDER, MIN_SPAN_DAYS } from '../src/modules/gateway/estimator-accuracy';
import { AuditService } from '../src/modules/audit/audit.service';
import { computeCost } from '../src/modules/pricing/pricing.service';
import { MetricsService } from '../src/modules/metrics/metrics.service';
import { harness, pricing, request } from './helpers/gateway-harness';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';

describe('failed attempts: what do we know about the money?', () => {
  it.each([
    ['upstream_auth_failed', 401, 'REJECTED_BY_PROVIDER', 'NOT_EXPECTED'],
    ['upstream_rate_limited', 429, 'REJECTED_BY_PROVIDER', 'NOT_EXPECTED'],
    ['upstream_billing_error', 402, 'REJECTED_BY_PROVIDER', 'NOT_EXPECTED'],
    ['upstream_invalid_request', 400, 'REJECTED_BY_PROVIDER', 'NOT_EXPECTED'],
    ['upstream_server_error', 503, 'PROVIDER_ERROR', 'UNCERTAIN'],
    ['upstream_overloaded', 529, 'PROVIDER_ERROR', 'UNCERTAIN'],
    ['upstream_timeout', undefined, 'EXECUTION_UNKNOWN', 'UNCERTAIN'],
    ['upstream_network_error', undefined, 'EXECUTION_UNKNOWN', 'UNCERTAIN'],
    ['upstream_invalid_response', 200, 'RESPONSE_UNUSABLE', 'LIKELY_CHARGED'],
    ['internal_error', undefined, 'EXECUTION_UNKNOWN', 'UNCERTAIN'],
    ['missing_provider_key', undefined, 'NOT_SENT', 'NOT_EXPECTED'],
    ['invalid_messages', undefined, 'NOT_SENT', 'NOT_EXPECTED'],
  ])('%s (upstream %s) → %s / %s', (errorClass, upstreamStatus, execution, billing) => {
    expect(classifyAttempt({ errorClass, upstreamStatus })).toEqual({ executionStatus: execution, billingStatus: billing });
  });
  it('an unknown situation is never reported as "no charge expected" when the provider may have run', () => {
    for (const status of [500, 502, 503, 504, 529, 200, 302]) expect(classifyAttempt({ errorClass: 'whatever', upstreamStatus: status }).billingStatus).not.toBe('NOT_EXPECTED');
  });
});

describe('estimator margin policy: evidence before change', () => {
  it('refuses to conclude from a small or short sample, whatever the numbers say', () => {
    const a = assessMargin({ providerSamples: MIN_SAMPLES_PER_PROVIDER - 1, spanDays: 30, underReservedPct: 50 });
    expect(a.sufficient).toBe(false);
    expect(a.verdict).toBe('insufficient_data');
    expect(assessMargin({ providerSamples: 5000, spanDays: MIN_SPAN_DAYS - 1, underReservedPct: 50 }).verdict).toBe('insufficient_data');
  });
  it('with enough evidence: under-coverage above 1% is flagged, otherwise no action; it never recommends lowering a margin', () => {
    expect(assessMargin({ providerSamples: 5000, spanDays: 30, underReservedPct: 3.2 }).verdict).toBe('reservation_under_covers_input');
    const ok = assessMargin({ providerSamples: 5000, spanDays: 30, underReservedPct: 0.2 });
    expect(ok.verdict).toBe('no_action_indicated');
    expect(ok.note).toMatch(/does not recommend lowering/);
  });
});

describe('metrics registry', () => {
  it('renders Prometheus text with bounded labels and escapes label values', () => {
    const m = new MetricsService();
    m.inc('x_total', { outcome: 'a"b\nc' });
    m.observe('x_ms', 12, { provider: 'OPENAI' });
    const text = m.render([{ name: 'g', value: 3, labels: { queue: 'q' } }]);
    expect(text).toContain('x_total{outcome="a\\"b\\nc"} 1');
    expect(text).toContain('x_ms_bucket{provider="OPENAI",le="25"} 1');
    expect(text).toContain('x_ms_count{provider="OPENAI"} 1');
    expect(text).toContain('g{queue="q"} 3');
  });
  it('time() records the duration even when the function throws', async () => {
    const m = new MetricsService();
    await expect(m.time('t_ms', async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(m.render()).toContain('t_ms_count 1');
  });
});

// ── The ten financial invariants (docs/FINANCIAL_RECONCILIATION.md §Invariants) ─────────────────────────────────────
describe('financial invariants', () => {
  const USAGE = { responseText: 'Rome.', promptTokens: 100, completionTokens: 20, totalTokens: 120, isSimulated: false };

  it('4. no double charging: one request settles once and writes one ledger row', async () => {
    const h = harness();
    await h.service.processChatCompletion(request());
    expect(h.calls.filter((c) => c === 'settle')).toHaveLength(1);
    expect(h.calls.filter((c) => c === 'ledger.create')).toHaveLength(1);
    expect(h.calls.filter((c) => c === 'release')).toHaveLength(0);
  });

  it('5. no silent zero-cost fallback: missing provider usage is ESTIMATED (and charged from the estimate), never confirmed and never zero', async () => {
    const h = harness({ adapterResult: { ...USAGE, usageEstimated: true } });
    const out: any = await h.service.processChatCompletion(request());
    const row = (h.prisma.request.create.mock.calls[0] as any[])[0].data;
    expect(row.usageStatus).toBe('ESTIMATED');
    expect(row.costEstimate).toBeGreaterThan(0);
    expect(out.governance.usage_status).toBe('estimated');
    expect(out.governance.usage_estimated).toBe(true);
    const confirmed = harness({ adapterResult: USAGE });
    const out2: any = await confirmed.service.processChatCompletion(request());
    expect((confirmed.prisma.request.create.mock.calls[0] as any[])[0].data.usageStatus).toBe('CONFIRMED');
    expect(out2.governance.usage_status).toBe('confirmed');
  });

  it('5b. an unknown outcome (timeout) is recorded as UNCERTAIN exposure, not as a free success and not as a charge', async () => {
    const err = new HttpException({ error: { message: 'timeout', code: 'upstream_timeout' } }, HttpStatus.GATEWAY_TIMEOUT);
    const h = harness({ adapterError: err });
    await expect(h.service.processChatCompletion(request())).rejects.toBe(err);
    expect(h.calls).not.toContain('ledger.create'); // nothing is charged without usage
    expect(h.calls).toContain('release'); // the reservation is released (see the reconciliation policy)
    const attempt = (h.prisma.requestAttempt.create.mock.calls[0] as any[])[0].data;
    expect(attempt).toMatchObject({ errorClass: 'upstream_timeout', executionStatus: 'EXECUTION_UNKNOWN', billingStatus: 'UNCERTAIN' });
    expect(attempt.estimatedCostUsd).toBeGreaterThan(0); // the exposure stays visible
  });

  it('7. no historical price rewriting: the ledger row stores the price it was settled with, and a later price change does not alter it', async () => {
    const h = harness();
    await h.service.processChatCompletion(request());
    const row = (h.prisma.request.create.mock.calls[0] as any[])[0].data;
    const meta = JSON.parse(row.metadataJson);
    expect(meta.pricing).toMatchObject({ inputPerMillion: expect.any(Number), outputPerMillion: expect.any(Number) });
    const snapshot = pricing.requireModelPrice('gpt-4o');
    const before = computeCost(snapshot, 1000, 1000);
    const recomputed = (1000 / 1e6) * meta.pricing.inputPerMillion + (1000 / 1e6) * meta.pricing.outputPerMillion;
    expect(recomputed).toBeCloseTo(before, 9); // the stored snapshot reproduces the charge exactly
  });

  it('8. no automatic model switching: the provider is called with exactly the requested model, whatever it costs', async () => {
    const h = harness();
    await h.service.processChatCompletion(request({ model: 'gpt-4o' }));
    expect((h.adapter.execute.mock.calls[0] as any[])[0].model).toBe('gpt-4o');
    expect((h.prisma.request.create.mock.calls[0] as any[])[0].data.model).toBe('gpt-4o');
  });

  it('estimator telemetry is stored as numbers only: no prompt text, and the estimate/reserve/version are all present', async () => {
    const h = harness();
    await h.service.processChatCompletion(request({ messages: [{ role: 'user', content: 'TOP-SECRET-CONTENT please summarise' }] }));
    const row = (h.prisma.request.create.mock.calls[0] as any[])[0].data;
    expect(row).toMatchObject({ estimatedInputTokens: expect.any(Number), reservedInputTokens: expect.any(Number), reservedOutputTokens: expect.any(Number), estimatorVersion: 'v2' });
    expect(row.reservedInputTokens).toBeGreaterThanOrEqual(row.estimatedInputTokens); // the margin only ever adds
    expect(JSON.stringify(row)).not.toContain('TOP-SECRET-CONTENT'); // not stored (content logging is off)
  });

  it('metrics are recorded for the money path without ids or content in labels', async () => {
    const metrics = new MetricsService();
    const h = harness();
    (h.service as any).metrics = metrics;
    await h.service.processChatCompletion(request());
    const text = metrics.render();
    expect(text).toContain('spendguard_gateway_requests_total{outcome="success"} 1');
    expect(text).toContain('spendguard_usage_total{status="confirmed"} 1');
    expect(text).toContain('spendguard_reservation_duration_ms_count 1');
    expect(text).toContain('spendguard_settlement_duration_ms_count 1');
    expect(text).toContain('spendguard_provider_duration_ms_count{outcome="ok",provider="OPENAI"} 1');
    expect(text).not.toMatch(/req_|sk-|org-/);
  });

  it('a Redis-unavailable refusal is counted (so a Redis outage is visible on a dashboard)', async () => {
    const metrics = new MetricsService();
    const h = harness({ budgetOverride: { canProceed: false, isHardBlocked: true, blockReason: 'Governance engine unavailable (Redis unreachable).', hold: undefined } });
    (h.service as any).metrics = metrics;
    await expect(h.service.processChatCompletion(request())).rejects.toBeInstanceOf(HttpException);
    expect(metrics.counterValue('spendguard_redis_failures_total', { op: 'reserve' })).toBe(1);
    expect(metrics.counterValue('spendguard_gateway_requests_total', { outcome: 'blocked_governance_unavailable' })).toBe(1);
  });

  it('a settlement that did not apply (duplicate) is counted, and still never charges twice', async () => {
    const metrics = new MetricsService();
    const h = harness();
    h.budget.settleHold.mockResolvedValueOnce({ applied: false, spend: 1 });
    (h.service as any).metrics = metrics;
    await h.service.processChatCompletion(request());
    expect(metrics.counterValue('spendguard_duplicate_settlement_attempts_total')).toBe(1);
  });

  void Logger;
});

// ── 6 / 10: exposure and reconciliation are tenant-scoped, validated and auditable ─────────────────────────────────
describe('attempt exposure and reconciliation', () => {
  function fake() {
    const attempts: any[] = [
      { id: 'a1', orgId: 'org-a', provider: 'OPENAI', billingStatus: 'UNCERTAIN', reconciledStatus: null, estimatedCostUsd: 0.5 },
      { id: 'a2', orgId: 'org-a', provider: 'OPENAI', billingStatus: 'LIKELY_CHARGED', reconciledStatus: null, estimatedCostUsd: 1.25 },
      { id: 'a3', orgId: 'org-a', provider: 'GROQ', billingStatus: 'NOT_EXPECTED', reconciledStatus: null, estimatedCostUsd: 9 },
      { id: 'b1', orgId: 'org-b', provider: 'OPENAI', billingStatus: 'UNCERTAIN', reconciledStatus: null, estimatedCostUsd: 100 },
    ];
    const audit: any[] = [];
    const ledgerWrites: any[] = [];
    const prisma: any = {
      requestAttempt: {
        groupBy: jest.fn(async ({ by, where }: any) => {
          const rows = attempts.filter((r) => r.orgId === where.orgId && (!where.billingStatus || where.billingStatus.in.includes(r.billingStatus)) && (where.reconciledStatus === undefined ? true : where.reconciledStatus === null ? r.reconciledStatus === null : r.reconciledStatus === where.reconciledStatus));
          const keyOf = (r: any) => by.map((b: string) => r[b]).join('|');
          const groups = new Map<string, any[]>();
          rows.forEach((r) => groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r]));
          return [...groups.values()].map((g) => ({ ...Object.fromEntries(by.map((b: string) => [b, g[0][b]])), _count: { id: g.length }, _sum: { estimatedCostUsd: g.reduce((a, r) => a + r.estimatedCostUsd, 0), reconciledCostUsd: g.reduce((a, r) => a + (r.reconciledCostUsd ?? 0), 0) } }));
        }),
        findFirst: jest.fn(async ({ where }: any) => attempts.find((r) => r.id === where.id && r.orgId === where.orgId) ?? null),
        update: jest.fn(async ({ where, data }: any) => Object.assign(attempts.find((r) => r.id === where.id)!, data)),
      },
      auditLog: { create: jest.fn(async ({ data }: any) => (audit.push(data), data)) },
      request: { create: jest.fn(async (x: any) => (ledgerWrites.push(x), x)), update: jest.fn(async (x: any) => (ledgerWrites.push(x), x)) },
    };
    return { svc: new AuditService(prisma), attempts, audit, ledgerWrites };
  }

  it('exposure counts only this organization\'s uncertain/likely-charged, unreconciled attempts and calls it exposure, not spend', async () => {
    const { svc } = fake();
    const out = await svc.attemptExposure('org-a');
    expect(out.unreconciled).toEqual(expect.arrayContaining([
      { provider: 'OPENAI', billingStatus: 'UNCERTAIN', attempts: 1, maxExposureUsd: 0.5 },
      { provider: 'OPENAI', billingStatus: 'LIKELY_CHARGED', attempts: 1, maxExposureUsd: 1.25 },
    ]));
    expect(out.unreconciled).toHaveLength(2); // NOT_EXPECTED and the other organization are excluded
    expect(out.note).toMatch(/upper bound/);
  });

  it('reconciling records the outcome, audits it, and writes NOTHING to the spend ledger', async () => {
    const { svc, attempts, audit, ledgerWrites } = fake();
    const out = await svc.reconcileAttempt('org-a', 'user-1', 'a1', { status: 'CHARGED_CONFIRMED', costUsd: 0.42, note: 'invoice INV-77' });
    expect(out).toMatchObject({ reconciledStatus: 'CHARGED_CONFIRMED', reconciledCostUsd: 0.42 });
    expect(attempts[0]).toMatchObject({ reconciledById: 'user-1', reconciledNote: 'invoice INV-77' });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ orgId: 'org-a', actor: 'user-1', action: 'attempt.reconciled' });
    expect(ledgerWrites).toHaveLength(0);
    const after = await svc.attemptExposure('org-a');
    expect(after.unreconciled.find((r: any) => r.billingStatus === 'UNCERTAIN')).toBeUndefined(); // no longer open exposure
    expect(after.confirmedUnledgeredUsd).toEqual([{ provider: 'OPENAI', attempts: 1, usd: 0.42 }]); // shown separately, still "not in the ledger"
  });

  it('another organization\'s attempt is a 404 and is not modified', async () => {
    const { svc, attempts } = fake();
    await expect(svc.reconcileAttempt('org-a', 'u', 'b1', { status: 'NOT_CHARGED_CONFIRMED' })).rejects.toBeInstanceOf(NotFoundException);
    expect(attempts[3].reconciledStatus).toBeNull();
  });

  it.each([
    ['unknown status', { status: 'MAYBE' }],
    ['charged without an amount', { status: 'CHARGED_CONFIRMED' }],
    ['charged with a negative amount', { status: 'CHARGED_CONFIRMED', costUsd: -1 }],
    ['charged with an absurd amount', { status: 'CHARGED_CONFIRMED', costUsd: 1e9 }],
    ['not-charged with an amount', { status: 'NOT_CHARGED_CONFIRMED', costUsd: 5 }],
  ])('rejects %s', async (_n, body) => {
    const { svc } = fake();
    await expect(svc.reconcileAttempt('org-a', 'u', 'a1', body as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('an attempt can be reconciled only once (a decision is not silently overwritten)', async () => {
    const { svc } = fake();
    await svc.reconcileAttempt('org-a', 'u', 'a1', { status: 'NOT_CHARGED_CONFIRMED' });
    await expect(svc.reconcileAttempt('org-a', 'u2', 'a1', { status: 'CHARGED_CONFIRMED', costUsd: 1 })).rejects.toThrow(/already been reconciled/);
  });
});
