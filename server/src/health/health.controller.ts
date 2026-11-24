import { Controller, Get, Headers, HttpException, HttpStatus, Header, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { PricingService } from '@/modules/pricing/pricing.service';
import { MetricsService } from '@/modules/metrics/metrics.service';
import { Public } from '@/modules/auth/decorators/public.decorator';
import { ALERT_DELIVERY_QUEUE } from '@/modules/alerts/alert-delivery.queue';
import { ANOMALY_QUEUE } from '@/modules/anomaly/anomaly.queue';
import { BUDGET_RECONCILIATION_QUEUE } from '@/modules/budget/budget-reconciliation.scheduler';
import { REQUEST_LEDGER_QUEUE } from '@/modules/gateway/request-ledger.queue';
import { NOTIFICATION_QUEUE } from '@/modules/notifications/notification.events';
import { INSIGHTS_QUEUE } from '@/modules/insights/insights.module';

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Three levels, deliberately different in what they reveal:
 *  - GET /health/live        process is up. No dependencies, no details.
 *  - GET /health/ready       can this instance serve traffic (database AND Redis reachable)? 200 or 503, with only
 *                            ok/down per dependency: no versions, hosts, counts or error text.
 *  - GET /health/diagnostics and GET /health/metrics   internal state (workers, backlogs, price-cache freshness,
 *                            counters). They require HEALTH_DIAGNOSTICS_TOKEN in the X-Health-Token header and are
 *                            DISABLED (404) when that variable is not set, so nothing internal is public by default.
 *  - GET /health             unchanged, kept for existing health checks (docker-compose).
 */
@ApiTags('System Health')
@Public()
@Controller(['health', 'api/health'])
export class HealthController implements OnModuleDestroy {
  private readonly handles = new Map<string, Queue>();

  /**
   * The queues are opened here as independent READ-ONLY handles (same names, same Redis) instead of being registered
   * again with BullModule: registering a queue name a second time shadows the original registration and the real
   * workers lose their connection. `queueFactory` is a test seam.
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly pricing: PricingService,
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
    @Optional() private readonly queueFactory?: (name: string) => Queue,
  ) {}

  private queue(name: string): Queue {
    let q = this.handles.get(name);
    if (!q) {
      q =
        this.queueFactory?.(name) ??
        new Queue(name, { connection: { host: this.config.get<string>('redis.host') || 'localhost', port: this.config.get<number>('redis.port') || 6379, password: this.config.get<string>('redis.password') || undefined } });
      this.handles.set(name, q);
    }
    return q;
  }

  async onModuleDestroy() {
    await Promise.all([...this.handles.values()].map((q) => q.close().catch(() => undefined)));
  }

  private async dbOk() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false; // public endpoint: never disclose driver errors or connection strings
    }
  }

  @Get()
  @ApiOperation({ summary: 'Liveness and readiness check for DB and Redis' })
  async check() {
    const dbStatus = (await this.dbOk()) ? 'healthy' : 'degraded';
    const redisStatus = await this.redisService.healthCheck();
    const allHealthy = dbStatus === 'healthy' && redisStatus === 'healthy';
    return {
      status: allHealthy ? 'ok' : 'degraded',
      service: 'spendguard-backend',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      checks: { database: dbStatus, redis: redisStatus, governance_engine: 'active', fail_closed_policy: 'enforced' },
    };
  }

  @Get('live')
  @ApiOperation({ summary: 'Process liveness (no dependency checks)' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: 200 only when the database and Redis are both reachable (the gateway fails closed without them)' })
  async ready() {
    const [db, redis] = await Promise.all([this.dbOk(), this.redisService.healthCheck()]);
    const body = { status: db && redis === 'healthy' ? 'ready' : 'not_ready', checks: { database: db ? 'ok' : 'down', redis: redis === 'healthy' ? 'ok' : 'down' } };
    if (body.status !== 'ready') throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }

  private authorizeDiagnostics(token: string | undefined) {
    const expected = process.env.HEALTH_DIAGNOSTICS_TOKEN;
    if (!expected || expected.length < 16) throw new HttpException('Not found', HttpStatus.NOT_FOUND); // disabled
    if (!token || !safeEqual(token, expected)) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
  }

  private async queueInfo(name: string, q: Queue) {
    try {
      const [workers, counts] = await Promise.all([q.getWorkers(), q.getJobCounts('waiting', 'active', 'delayed', 'failed')]);
      const oldest = (await q.getWaiting(0, 0))[0];
      return { name, workers: workers.length, ...counts, oldestWaitingSeconds: oldest ? Math.max(0, Math.round((Date.now() - oldest.timestamp) / 1000)) : 0 };
    } catch {
      return { name, workers: null as number | null, error: 'unavailable' } as Record<string, any>;
    }
  }

  /** Everything the dashboards and alerts need, computed at scrape time. Counts only; never row content. */
  private async snapshot() {
    const queues = await Promise.all([ANOMALY_QUEUE, REQUEST_LEDGER_QUEUE, NOTIFICATION_QUEUE, ALERT_DELIVERY_QUEUE, INSIGHTS_QUEUE, BUDGET_RECONCILIATION_QUEUE].map((name) => this.queueInfo(name, this.queue(name))));
    const db = await this.dbOk();
    let notif = { pending: 0, retrying: 0, failed24h: 0, oldestPendingSeconds: 0 };
    let anomalyPending = 0;
    let exposure = { attempts: 0, usd: 0 };
    let rollup: { completeThrough: string | null; lastDiscrepancies: number } = { completeThrough: null, lastDiscrepancies: 0 };
    if (db) {
      try {
        const [pending, retrying, failed, oldest, anom, exp, st] = await Promise.all([
          this.prisma.notificationDelivery.count({ where: { status: 'QUEUED', channelId: { not: null } } }),
          this.prisma.notificationDelivery.count({ where: { status: 'RETRYING' } }),
          this.prisma.notificationDelivery.count({ where: { status: 'FAILED', createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
          this.prisma.notificationDelivery.findFirst({ where: { status: { in: ['QUEUED', 'RETRYING'] }, channelId: { not: null } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
          this.prisma.request.count({ where: { anomalyStatus: 'PENDING', createdAt: { lt: new Date(Date.now() - 10 * 60_000) } } }),
          this.prisma.requestAttempt.aggregate({ where: { billingStatus: { in: ['UNCERTAIN', 'LIKELY_CHARGED'] }, reconciledStatus: null }, _count: { id: true }, _sum: { estimatedCostUsd: true } }),
          this.prisma.rollupState.findUnique({ where: { key: 'requests_daily' } }),
        ]);
        notif = { pending, retrying, failed24h: failed, oldestPendingSeconds: oldest ? Math.round((Date.now() - oldest.createdAt.getTime()) / 1000) : 0 };
        anomalyPending = anom;
        exposure = { attempts: exp._count.id, usd: Number(exp._sum.estimatedCostUsd ?? 0) };
        rollup = { completeThrough: st?.completeThrough ? st.completeThrough.toISOString().slice(0, 10) : null, lastDiscrepancies: st?.lastDiscrepancies ?? 0 };
      } catch {
        /* the gauges stay at their defaults; the database flag already tells the story */
      }
    }
    return { db, redis: await this.redisService.healthCheck(), queues, notif, anomalyPending, exposure, rollup, pricing: this.pricing.getSyncState() };
  }

  @Get('diagnostics')
  @ApiOperation({ summary: 'Internal state: workers, backlogs, price-cache freshness (requires X-Health-Token; disabled unless HEALTH_DIAGNOSTICS_TOKEN is set)' })
  async diagnostics(@Headers('x-health-token') token?: string) {
    this.authorizeDiagnostics(token);
    const s = await this.snapshot();
    const workersMissing = s.queues.filter((q) => q.workers === 0).map((q) => q.name);
    return {
      status: s.db && s.redis === 'healthy' && !workersMissing.length && !s.pricing.stale ? 'ok' : 'attention',
      database: s.db ? 'ok' : 'down',
      redis: s.redis,
      workers: { queues: s.queues, queuesWithNoWorker: workersMissing },
      notifications: s.notif,
      anomalyEvaluationsPendingOver10Min: s.anomalyPending,
      unreconciledProviderExposure: s.exposure,
      pricingCache: s.pricing,
      insightsRollup: s.rollup,
    };
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  @ApiOperation({ summary: 'Prometheus metrics (requires X-Health-Token; disabled unless HEALTH_DIAGNOSTICS_TOKEN is set)' })
  async prometheus(@Headers('x-health-token') token?: string) {
    this.authorizeDiagnostics(token);
    const s = await this.snapshot();
    const g = (name: string, value: number, help: string, labels: Record<string, string> = {}) => ({ name, help, value, labels });
    return this.metrics.render([
      g('spendguard_up', 1, 'Process is running'),
      g('spendguard_database_up', s.db ? 1 : 0, 'Database reachable'),
      g('spendguard_redis_up', s.redis === 'healthy' ? 1 : 0, 'Redis reachable'),
      ...s.queues.flatMap((q) => [
        g('spendguard_queue_workers', q.workers ?? -1, 'Connected workers per queue (-1 = unknown)', { queue: q.name }),
        g('spendguard_queue_waiting', q.waiting ?? 0, 'Jobs waiting per queue', { queue: q.name }),
        g('spendguard_queue_failed', q.failed ?? 0, 'Failed jobs retained per queue', { queue: q.name }),
        g('spendguard_queue_oldest_waiting_seconds', q.oldestWaitingSeconds ?? 0, 'Age of the oldest waiting job', { queue: q.name }),
      ]),
      g('spendguard_notification_pending', s.notif.pending, 'Deliveries queued and not yet attempted'),
      g('spendguard_notification_retrying', s.notif.retrying, 'Deliveries waiting for a retry'),
      g('spendguard_notification_failed_24h', s.notif.failed24h, 'Deliveries that failed permanently in the last 24h (the dead-letter view)'),
      g('spendguard_notification_oldest_pending_seconds', s.notif.oldestPendingSeconds, 'Age of the oldest undelivered notification'),
      g('spendguard_anomaly_pending_over_10m', s.anomalyPending, 'Ledger rows whose anomaly evaluation has not completed after 10 minutes'),
      g('spendguard_unreconciled_exposure_attempts', s.exposure.attempts, 'Failed provider calls that may have been billed and are not reconciled'),
      g('spendguard_unreconciled_exposure_usd', s.exposure.usd, 'Upper bound (released reservations) of that exposure; not a charge'),
      g('spendguard_pricing_cache_stale', s.pricing.stale ? 1 : 0, 'This instance has not refreshed its price cache recently'),
      g('spendguard_rollup_last_discrepancies', s.rollup.lastDiscrepancies, 'Days the last rollup reconciliation had to repair'),
    ]);
  }
}
