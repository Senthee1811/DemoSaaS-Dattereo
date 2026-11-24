import 'reflect-metadata';
import { HttpException } from '@nestjs/common';
import { HealthController } from '../src/health/health.controller';
import { MetricsService } from '../src/modules/metrics/metrics.service';

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

function build(opts: { db?: boolean; redis?: 'healthy' | 'degraded' | 'disconnected'; workers?: number } = {}) {
  const prisma: any = {
    $queryRaw: jest.fn(async () => {
      if (opts.db === false) throw new Error('connect ECONNREFUSED postgresql://user:SECRETPASS@db.internal:5432/app');
      return [{ '?column?': 1 }];
    }),
    notificationDelivery: { count: jest.fn(async () => 2), findFirst: jest.fn(async () => ({ createdAt: new Date(Date.now() - 5000) })) },
    request: { count: jest.fn(async () => 1) },
    requestAttempt: { aggregate: jest.fn(async () => ({ _count: { id: 3 }, _sum: { estimatedCostUsd: 1.5 } })) },
    rollupState: { findUnique: jest.fn(async () => ({ completeThrough: new Date('2026-11-24'), lastDiscrepancies: 1 })) },
  };
  const redis: any = { healthCheck: jest.fn(async () => opts.redis ?? 'healthy') };
  const pricing: any = { getSyncState: () => ({ stale: false, lastRefreshOk: true, models: 40 }) };
  const q: any = { getWorkers: async () => Array(opts.workers ?? 1).fill({}), getJobCounts: async () => ({ waiting: 4, active: 1, delayed: 0, failed: 2 }), getWaiting: async () => [{ timestamp: Date.now() - 3000 }] };
  const metrics = new MetricsService();
  return { ctrl: new HealthController(prisma, redis, pricing, metrics, { get: () => undefined } as any, () => q), prisma, metrics };
}
const statusOf = async (p: Promise<unknown>) => ((await p.then(() => null, (e) => e)) as HttpException | null)?.getStatus?.() ?? 200;

describe('liveness and readiness reveal nothing internal', () => {
  it('live needs no dependency and says only ok', () => {
    expect(build({ db: false, redis: 'disconnected' }).ctrl.live()).toEqual({ status: 'ok' });
  });
  it('ready is 200 only when the database AND Redis are reachable, and the body is just ok/down', async () => {
    expect(await build().ctrl.ready()).toEqual({ status: 'ready', checks: { database: 'ok', redis: 'ok' } });
  });
  it.each([[{ db: false }], [{ redis: 'disconnected' as const }], [{ redis: 'degraded' as const }]])('ready is 503 when a dependency is down (%j), with no error text, host or credentials', async (o) => {
    const { ctrl } = build(o);
    const e = (await ctrl.ready().then(() => null, (x) => x)) as HttpException;
    expect(e.getStatus()).toBe(503);
    const text = JSON.stringify(e.getResponse());
    expect(text).toMatch(/not_ready/);
    expect(text).not.toMatch(/SECRETPASS|ECONNREFUSED|db\.internal|postgres/i);
  });
  it('the legacy /health stays 200-shaped and never discloses driver errors', async () => {
    const out: any = await build({ db: false }).ctrl.check();
    expect(out.checks.database).toBe('degraded');
    expect(JSON.stringify(out)).not.toMatch(/SECRETPASS|ECONNREFUSED/);
  });
});

describe('diagnostics and metrics are protected, and off unless configured', () => {
  it('disabled (404) when HEALTH_DIAGNOSTICS_TOKEN is not set, so nothing internal is public by default', async () => {
    delete process.env.HEALTH_DIAGNOSTICS_TOKEN;
    const { ctrl } = build();
    expect(await statusOf(ctrl.diagnostics('anything'))).toBe(404);
    expect(await statusOf(ctrl.prometheus('anything'))).toBe(404);
  });
  it('a too-short configured token is treated as not configured', async () => {
    process.env.HEALTH_DIAGNOSTICS_TOKEN = 'short';
    expect(await statusOf(build().ctrl.diagnostics('short'))).toBe(404);
  });
  it('401 for a missing or wrong token', async () => {
    process.env.HEALTH_DIAGNOSTICS_TOKEN = 'a-long-enough-diagnostics-token';
    const { ctrl } = build();
    expect(await statusOf(ctrl.diagnostics(undefined))).toBe(401);
    expect(await statusOf(ctrl.diagnostics('a-long-enough-diagnostics-tokeX'))).toBe(401);
    expect(await statusOf(ctrl.prometheus('wrong'))).toBe(401);
  });
  it('with the token: workers, backlogs, notification state, exposure, price-cache freshness and rollup status; counts only', async () => {
    process.env.HEALTH_DIAGNOSTICS_TOKEN = 'a-long-enough-diagnostics-token';
    const out: any = await build().ctrl.diagnostics('a-long-enough-diagnostics-token');
    expect(out.status).toBe('ok');
    expect(out.workers.queues).toHaveLength(6);
    expect(out.workers.queues[0]).toMatchObject({ workers: 1, waiting: 4, failed: 2, oldestWaitingSeconds: expect.any(Number) });
    expect(out.notifications).toMatchObject({ pending: 2, failed24h: 2 });
    expect(out.unreconciledProviderExposure).toEqual({ attempts: 3, usd: 1.5 });
    expect(out.pricingCache.stale).toBe(false);
    expect(out.insightsRollup).toEqual({ completeThrough: '2026-11-24', lastDiscrepancies: 1 });
    expect(JSON.stringify(out)).not.toMatch(/password|secret|token|postgres:|redis:/i);
  });
  it('a queue with no connected worker turns the status to "attention" and is named', async () => {
    process.env.HEALTH_DIAGNOSTICS_TOKEN = 'a-long-enough-diagnostics-token';
    const out: any = await build({ workers: 0 }).ctrl.diagnostics('a-long-enough-diagnostics-token');
    expect(out.status).toBe('attention');
    expect(out.workers.queuesWithNoWorker).toContain('notification-delivery');
  });
  it('a database outage is reported without leaking the connection error', async () => {
    process.env.HEALTH_DIAGNOSTICS_TOKEN = 'a-long-enough-diagnostics-token';
    const out: any = await build({ db: false }).ctrl.diagnostics('a-long-enough-diagnostics-token');
    expect(out.database).toBe('down');
    expect(out.status).toBe('attention');
    expect(JSON.stringify(out)).not.toMatch(/SECRETPASS|ECONNREFUSED/);
  });
  it('the Prometheus text has the operational gauges and recorded counters', async () => {
    process.env.HEALTH_DIAGNOSTICS_TOKEN = 'a-long-enough-diagnostics-token';
    const { ctrl, metrics } = build();
    metrics.inc('spendguard_gateway_requests_total', { outcome: 'success' });
    const text = await ctrl.prometheus('a-long-enough-diagnostics-token');
    for (const m of ['spendguard_up 1', 'spendguard_database_up 1', 'spendguard_redis_up 1', 'spendguard_queue_workers{queue="notification-delivery"} 1', 'spendguard_notification_failed_24h 2', 'spendguard_unreconciled_exposure_usd 1.5', 'spendguard_pricing_cache_stale 0', 'spendguard_gateway_requests_total{outcome="success"} 1']) {
      expect(text).toContain(m);
    }
  });
});
