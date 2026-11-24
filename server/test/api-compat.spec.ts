import 'reflect-metadata';
import { HttpException } from '@nestjs/common';
import { AuditService } from '../src/modules/audit/audit.service';
import { AnalyticsService } from '../src/modules/analytics/analytics.service';
import { GlobalHttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { normalizeUpstreamError } from '../src/modules/gateway/adapters/provider-http';
import { harness, request } from './helpers/gateway-harness';

/**
 * Backward-compatibility contract: every key that existed before this change must still be there with
 * the same type. New keys are additive. The one deliberate VALUE change is governance.is_anomaly
 * (false -> null while unevaluated), asserted explicitly below.
 */
const hasAll = (obj: object, keys: string[]) => keys.forEach((k) => expect(obj).toHaveProperty(k));

describe('gateway response (POST /v1/chat/completions)', () => {
  it('keeps every pre-existing top-level, choices, usage, governance and header key', async () => {
    const h = harness();
    const out = await h.service.processChatCompletion(request());
    hasAll(out, ['id', 'object', 'created', 'model', 'provider', 'choices', 'usage', 'governance', 'headers']);
    expect(out.object).toBe('chat.completion');
    expect(out.id).toMatch(/^chatcmpl-req_/);
    hasAll(out.choices[0], ['index', 'message', 'finish_reason']);
    expect(out.choices[0].message).toEqual({ role: 'assistant', content: 'Rome.' });
    expect(out.usage).toEqual({ prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 });
    hasAll(out.governance, ['cost_estimate_usd', 'latency_ms', 'is_anomaly', 'anomaly_reason', 'project_id', 'budget_remaining_usd', 'fail_closed_active']);
    hasAll(out.headers, ['X-SpendGuard-Cost', 'X-SpendGuard-Latency', 'X-SpendGuard-Blocked']);
    expect(typeof out.governance.cost_estimate_usd).toBe('number');
    expect(typeof out.governance.latency_ms).toBe('number');
    expect(out.governance.fail_closed_active).toBe(true);
    expect(out.headers['X-SpendGuard-Blocked']).toBe('false');
  });

  it('the additions are additive and new', async () => {
    const out = await harness().service.processChatCompletion(request());
    hasAll(out.governance, ['anomaly', 'reservation', 'provider_finish_reason', 'usage_estimated']);
    hasAll(out.headers, ['X-SpendGuard-Anomaly-Status', 'X-SpendGuard-Reservation-Overrun']);
  });

  it('the ONE value change: is_anomaly is null (not evaluated) instead of false; it is still falsy for legacy `if (is_anomaly)` checks', async () => {
    const out = await harness().service.processChatCompletion(request());
    expect(out.governance.is_anomaly).toBeNull();
    expect(out.governance.anomaly_reason).toBeNull();
    expect(!!out.governance.is_anomaly).toBe(false);
  });

  it('finish_reason is still always one of the four OpenAI values a client expects', async () => {
    for (const fr of [undefined, 'stop', 'length', 'tool_calls', 'content_filter']) {
      const h = harness({ adapterResult: { responseText: 'x', promptTokens: 1, completionTokens: 1, totalTokens: 2, isSimulated: false, finishReason: fr } });
      const out = await h.service.processChatCompletion(request());
      expect(['stop', 'length', 'tool_calls', 'content_filter']).toContain(out.choices[0].finish_reason);
    }
  });
});

describe('error envelope', () => {
  const render = (e: unknown) => {
    const json = jest.fn();
    const res: any = { status: jest.fn(() => ({ json })) };
    new GlobalHttpExceptionFilter().catch(e, { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ method: 'POST', url: '/v1/chat/completions', requestId: 'r1' }) }) } as any);
    return { status: res.status.mock.calls[0][0], body: json.mock.calls[0][0] };
  };

  it('upstream failures keep the flat { statusCode, error: { message, type, code }, message } envelope', () => {
    const { status, body } = render(normalizeUpstreamError({ providerLabel: 'OpenAI', status: 429, rawBody: JSON.stringify({ error: { message: 'slow down', code: 'rate_limit_exceeded' } }), retryAfter: '7' }));
    expect(status).toBe(429);
    hasAll(body, ['statusCode', 'timestamp', 'path', 'requestId', 'error', 'message']);
    hasAll(body.error, ['message', 'type', 'code']);
    expect(body.message).toBe(body.error.message);
    expect(body.error).toMatchObject({ type: 'upstream_provider_error', code: 'upstream_rate_limited', upstream_provider: 'OpenAI', upstream_status: 429, retry_after_seconds: 7 });
  });

  it('budget and auth errors are unchanged (a provider auth failure is NOT shaped like a SpendGuard auth failure)', () => {
    const providerAuth = render(normalizeUpstreamError({ providerLabel: 'OpenAI', status: 401, rawBody: '{}' }));
    expect(providerAuth.status).toBe(502);
    expect(providerAuth.body.error.type).toBe('upstream_provider_error');
    const spendguardAuth = render(new HttpException({ error: { message: 'Invalid SpendGuard Gateway API key.', type: 'authentication_error', code: 'invalid_api_key' } }, 401));
    expect(spendguardAuth.status).toBe(401);
    expect(spendguardAuth.body.error).toMatchObject({ type: 'authentication_error', code: 'invalid_api_key' });
  });
});

describe('audit log API', () => {
  const row = (extra: any = {}) => ({
    id: 'req_1', projectId: 'proj-a', userId: null, provider: 'OPENAI', model: 'gpt-4o', tokensIn: 10, tokensOut: 5, totalTokens: 15,
    costEstimate: 0.001, latencyMs: 90, statusCode: 200, isAnomaly: false, anomalyReason: null, isBlocked: false, promptPreview: null, responsePreview: null,
    createdAt: new Date('2026-11-24T10:00:00Z'), project: { name: 'Proj A', logRequestContent: false }, user: null,
    anomalyStatus: 'PENDING', reservedCostUsd: 0.002, reservationOverrunUsd: 0, ...extra,
  });
  const svc = (rows: any[], captured: any[] = []) =>
    new AuditService({
      request: {
        findMany: jest.fn(async (a: any) => { captured.push(a.where); return a.where.id?.gt ? [] : rows; }),
        count: jest.fn(async () => rows.length),
      },
    } as any);

  it('keeps every pre-existing field with the same types', async () => {
    const out = await svc([row()]).listLogs({ orgId: 'org-a' });
    hasAll(out, ['logs', 'total']);
    hasAll(out.logs[0], ['id', 'projectId', 'projectName', 'userId', 'userName', 'userEmail', 'provider', 'model', 'tokensIn', 'tokensOut', 'totalTokens', 'costEstimate', 'latencyMs', 'statusCode', 'isAnomaly', 'anomalyReason', 'isBlocked', 'timestamp']);
    expect(typeof out.logs[0].costEstimate).toBe('number');
    expect(typeof out.logs[0].isAnomaly).toBe('boolean');
  });

  it('adds anomalyStatus and reservation fields; isAnomaly stays boolean and true ONLY for a confirmed anomaly', async () => {
    const out = await svc([row({ anomalyStatus: 'PENDING' }), row({ id: 'r2', anomalyStatus: 'CLEAR' }), row({ id: 'r3', anomalyStatus: 'ANOMALY', isAnomaly: true }), row({ id: 'r4', anomalyStatus: 'FAILED' })]).listLogs({ orgId: 'org-a' });
    expect(out.logs.map((l) => [l.anomalyStatus, l.isAnomaly])).toEqual([['PENDING', false], ['CLEAR', false], ['ANOMALY', true], ['FAILED', false]]);
    expect(out.logs[0]).toMatchObject({ reservedCost: 0.002, reservationOverrun: 0 });
  });

  it('every query is scoped to the caller\'s organization (also with a client-supplied projectId)', async () => {
    const captured: any[] = [];
    await svc([row()], captured).listLogs({ orgId: 'org-a', projectId: 'proj-of-org-b' });
    expect(captured[0]).toMatchObject({ project: { orgId: 'org-a' }, projectId: 'proj-of-org-b' }); // the org filter is ANDed, so org B's project yields nothing
  });

  it('CSV: the first 16 columns are unchanged and in order; new columns are only ever appended; a pending row is not exported as "NO" without a status', async () => {
    const csv = await new AuditService({
      request: { findMany: jest.fn().mockResolvedValueOnce([row()]).mockResolvedValueOnce([]) },
    } as any).generateCsv('org-a');
    const [header, line] = csv.split(/\r?\n/);
    const cols = header.split(',');
    expect(cols.slice(0, 16)).toEqual([
      'Request ID', 'Timestamp (UTC)', 'Project Name', 'User Name', 'User Email', 'AI Provider', 'Model', 'Prompt Tokens', 'Completion Tokens', 'Total Tokens',
      'Cost Estimate (USD)', 'Latency (ms)', 'HTTP Status', 'Is Anomaly', 'Anomaly Reason', 'Is Hard Blocked',
    ]);
    // Appended in Phase 1 (anomaly/reservation) and Phase 2.4 (usage status); earlier positions never move
    expect(cols.slice(16)).toEqual(['Anomaly Status', 'Reserved (USD)', 'Reservation Overrun (USD)', 'Usage Status']);
    expect(line).toContain('"PENDING"');
    expect(line.split(',')).toHaveLength(cols.length); // every row has a value (possibly empty) for every column
  });
});

describe('analytics API', () => {
  function make(captured: any[] = []) {
    const rec = (name: string, result: any) => jest.fn(async (a: any) => { captured.push({ name, where: a?.where }); return result; });
    const prisma: any = {
      request: {
        aggregate: jest.fn(async (a: any) => {
          captured.push({ name: 'aggregate', where: a.where });
          return a.where.reservationOverrunUsd ? { _sum: { reservationOverrunUsd: 0.5 }, _count: { id: 2 } } : { _sum: { costEstimate: 12.5, totalTokens: 900 }, _count: { id: 7 }, _avg: { latencyMs: 120 } };
        }),
        count: jest.fn(async (a: any) => { captured.push({ name: 'count', where: a.where }); return a.where.anomalyStatus ? 3 : a.where.isAnomaly ? 1 : 0; }),
        groupBy: rec('groupBy', []),
        findMany: jest.fn(async (a: any) => {
          captured.push({ name: 'findMany', where: a.where });
          return a.take === 10
            ? [{ id: 'r1', projectId: 'proj-a', project: { name: 'A' }, user: null, provider: 'OPENAI', model: 'gpt-4o', tokensIn: 1, tokensOut: 1, totalTokens: 2, costEstimate: 0.1, latencyMs: 5, statusCode: 200, isAnomaly: false, anomalyReason: null, anomalyStatus: 'PENDING', reservedCostUsd: 0.2, reservationOverrunUsd: 0, isBlocked: false, createdAt: new Date() }]
            : [];
        }),
      },
      project: { findMany: rec('project.findMany', [{ id: 'proj-a', name: 'A', budgetMonthly: 100, isBlocked: false }]) },
    };
    const redis: any = { getCache: async () => null, setCache: async () => undefined };
    return { svc: new AnalyticsService(prisma, redis), captured };
  }

  it('keeps every pre-existing key; anomalyCount counts only CONFIRMED anomalies; unevaluated requests are reported separately', async () => {
    const { svc } = make();
    const out = await svc.getDashboardAnalytics('org-a');
    hasAll(out, ['summary', 'dailySpend', 'modelBreakdown', 'projectBreakdown', 'recentRequests']);
    hasAll(out.summary, ['totalSpend', 'totalBudget', 'budgetUtilizationPct', 'totalTokens', 'totalRequests', 'avgLatency', 'anomalyCount', 'blockedCount']);
    hasAll(out.recentRequests[0], ['id', 'project_id', 'project_name', 'user_name', 'provider', 'model', 'tokens_in', 'tokens_out', 'total_tokens', 'cost_estimate', 'latency_ms', 'status_code', 'is_anomaly', 'anomaly_reason', 'is_blocked', 'created_at']);
    expect(out.summary.anomalyCount).toBe(1);
    expect(out.summary).toMatchObject({ anomalyPendingCount: 3, reservationOverrunCount: 2, reservationOverrunUsd: 0.5 });
    expect(out.recentRequests[0]).toMatchObject({ is_anomaly: false, anomaly_status: 'PENDING', reserved_cost: 0.2, reservation_overrun: 0 });
  });

  it('every query is scoped to the caller\'s organization', async () => {
    const { svc, captured } = make();
    await svc.getDashboardAnalytics('org-a');
    const requestQueries = captured.filter((c) => ['aggregate', 'count', 'groupBy', 'findMany'].includes(c.name));
    expect(requestQueries.length).toBeGreaterThanOrEqual(7);
    for (const q of requestQueries) expect(q.where).toMatchObject({ project: { orgId: 'org-a' } });
    expect(captured.find((c) => c.name === 'project.findMany')!.where).toMatchObject({ orgId: 'org-a' });
  });

  it('the cache is keyed by organization (one tenant can never be served another tenant\'s numbers)', async () => {
    const keys: string[] = [];
    const { svc } = make();
    (svc as any).redisService = { getCache: async (k: string) => { keys.push(k); return null; }, setCache: async (k: string) => { keys.push(k); } };
    await svc.getDashboardAnalytics('org-a');
    await svc.getDashboardAnalytics('org-b', 'proj-x');
    expect(new Set(keys).size).toBe(2);
    expect(keys.every((k) => k.includes('org-a') || k.includes('org-b'))).toBe(true);
  });
});

describe('pricing list API', () => {
  it('GET shape is unchanged', async () => {
    const row = { model: 'gpt-4o', provider: 'OPENAI', displayName: 'GPT-4o', inputPricePerMillion: 2.5, outputPricePerMillion: 10, cachedInputPrice: 1.25, contextWindow: 128000, source: 'manual', priceUpdatedAt: new Date(), providerStatus: null, providerCheckedAt: null, retiresAt: null, updatedAt: new Date(), isActive: true };
    const svc = new PricingService({ modelPricing: { findMany: async () => [row] } } as any, { getCache: async () => null } as any);
    const out = await svc.listPrices();
    hasAll(out, ['models', 'meta']);
    hasAll(out.meta, ['pricingUpdatedAt', 'lastAvailabilityCheckAt', 'priceSource']);
    hasAll(out.models[0], ['model', 'provider', 'displayName', 'inputPricePerMillion', 'outputPricePerMillion', 'cachedInputPrice', 'contextWindow', 'source', 'updatedAt', 'providerStatus', 'providerCheckedAt', 'retiresAt']);
  });
});
