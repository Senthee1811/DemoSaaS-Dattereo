import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { BudgetService } from '@/modules/budget/budget.service';
import { AnomalyService } from './anomaly.service';
import {
  ANOMALY_QUEUE,
  DETECT_ANOMALY_JOB,
  DETECT_ANOMALY_JOB_OPTS,
  SWEEP_ANOMALY_JOB,
  ANOMALY_CLAIM_LEASE_SECONDS,
  AnomalyJob,
  anomalyAlertDedupKey,
  anomalyAlertTitle,
  anomalyAlertWindowSeconds,
  sweepConfig,
} from './anomaly.queue';

const HISTORY_SIZE = 40;
const CLAIM_LEASE = 'lease';
const CLAIM_DONE = 'done';
/** States in which a request still needs (or can be given) an evaluation. */
const OPEN_STATES = ['PENDING', 'FAILED'];

/**
 * Scores a completed request against the project's recent history and records the outcome on its
 * ledger row: PENDING -> CLEAR | ANOMALY (or FAILED when processing could not complete).
 *
 * Runs entirely off the request path. Nothing here can change a budget decision: the hold was
 * settled and the ledger row written before the job was queued, and every failure here is a retry or
 * a FAILED status, never an error to the caller.
 *
 * Reliability model (what is and is not guaranteed):
 *  - The row's `anomaly_status` is the source of truth. A queued job is an optimisation.
 *  - Processing is IDEMPOTENT: a duplicate job, a retry, or a job replayed after a worker crash finds
 *    the row already decided and exits; the alert is claimed per project+model so it cannot repeat.
 *  - Lost jobs (queue publish failed, Redis restarted without persistence, retries exhausted,
 *    worker died) are recovered by `sweep`, which re-queues rows still PENDING/FAILED from Postgres.
 *  - Alerts are at-least-once with a database double-check, so a crash between "alert recorded" and
 *    "claim extended" cannot produce a second alert inside the window.
 */
@Processor(ANOMALY_QUEUE)
export class AnomalyProcessor extends WorkerHost {
  private readonly logger = new Logger(AnomalyProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly anomaly: AnomalyService,
    private readonly budget: BudgetService,
    @InjectQueue(ANOMALY_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job<AnomalyJob>): Promise<unknown> {
    if (job.name === SWEEP_ANOMALY_JOB) return this.sweep();
    return this.evaluate(job);
  }

  // ── Evaluation ────────────────────────────────────────────────────────────

  private async evaluate(job: Job<AnomalyJob>): Promise<void> {
    const { requestId, projectId, model, costEstimate, totalTokens, createdAt } = job.data;
    const at = new Date(createdAt);

    // Duplicate / replayed job: the request already has its verdict
    const existing = await this.prisma.request.findUnique({ where: { id: requestId }, select: { anomalyStatus: true } });
    if (existing && !OPEN_STATES.includes(existing.anomalyStatus)) return;

    const history = await this.prisma.request.findMany({
      where: { projectId, isBlocked: false, id: { not: requestId }, createdAt: { lt: at } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_SIZE,
      select: { costEstimate: true, totalTokens: true },
    });

    const result = this.anomaly.detectSpike(
      costEstimate,
      totalTokens,
      history.map((r) => ({ costEstimate: Number(r.costEstimate), totalTokens: r.totalTokens })),
    );

    if (!result.isAnomaly) {
      const done = await this.prisma.request.updateMany({
        where: { id: requestId, anomalyStatus: { in: OPEN_STATES } },
        data: { anomalyStatus: 'CLEAR', anomalyEvaluatedAt: new Date() },
      });
      this.requireRow(done.count, existing, requestId);
      return;
    }

    // Alert BEFORE marking the row ANOMALY: the status is the last write, so an ANOMALY row always
    // means the alert was handled, and a crash in between simply replays this job.
    await this.alertOncePerWindow({ projectId, model, costEstimate, reason: result.reason });

    const done = await this.prisma.request.updateMany({
      where: { id: requestId, anomalyStatus: { in: OPEN_STATES } },
      data: { isAnomaly: true, anomalyReason: result.reason ?? null, anomalyStatus: 'ANOMALY', anomalyEvaluatedAt: new Date() },
    });
    this.requireRow(done.count, existing, requestId);
  }

  /** The ledger row may still be in the ledger retry queue: fail the job so it is retried once the row exists. */
  private requireRow(updated: number, existing: { anomalyStatus: string } | null, requestId: string): void {
    if (updated === 0 && !existing) throw new Error(`Ledger row for ${requestId} is not persisted yet; retrying`);
  }

  /**
   * At most one alert per project+model per window, safe against crashes, Redis loss and races:
   *  1. claim a short LEASE (SET NX EX 60). A concurrent worker loses and suppresses.
   *  2. check Postgres for an alert already recorded in the window (covers a lost/expired Redis key
   *     and a crash after the alert was written but before the claim was extended).
   *  3. record the alert, then extend the claim to the full window.
   * Any failure releases the lease and fails the job so BullMQ (or the sweep) retries.
   */
  private async alertOncePerWindow(p: { projectId: string; model: string; costEstimate: number; reason?: string }): Promise<void> {
    const key = anomalyAlertDedupKey(p.projectId, p.model);
    const windowSeconds = anomalyAlertWindowSeconds();

    const claimed = await this.redis.acquireOnce(key, ANOMALY_CLAIM_LEASE_SECONDS, CLAIM_LEASE);
    if (claimed === null) throw new Error('Alert claim store unavailable; retrying'); // do not guess: no alert storm
    if (!claimed) {
      // Suppress ONLY when the alert for this window is confirmed (value 'done'). A bare lease means
      // another worker is mid-way; if it dies the lease expires, so retry instead of dropping the alert.
      const state = await this.redis.getCache(key);
      if (state === CLAIM_DONE) {
        this.logger.debug(`Anomaly alert suppressed for project ${p.projectId} / ${p.model} (already alerted this window)`);
        return;
      }
      throw new Error('Alert claim is leased by another worker (or just expired); retrying');
    }

    try {
      const title = anomalyAlertTitle(p.model);
      const prior = await this.prisma.budgetAlert.findFirst({
        where: { projectId: p.projectId, thresholdType: 'ANOMALY_DETECTED', title, triggeredAt: { gte: new Date(Date.now() - windowSeconds * 1000) } },
        select: { id: true },
      });
      if (!prior) {
        const recorded = await this.budget.recordAlert({
          projectId: p.projectId,
          thresholdType: 'ANOMALY_DETECTED',
          thresholdValue: p.costEstimate,
          title,
          message: p.reason || `Abnormal token volume on ${p.model}`,
        });
        if (!recorded) throw new Error('Alert could not be recorded; retrying');
      }
      await this.redis.setCache(key, CLAIM_DONE, windowSeconds); // lease -> confirmed, for the full window
    } catch (err) {
      await this.redis.delCache(key); // nothing (or not everything) was recorded: let the retry alert
      throw err;
    }
  }

  // ── Failure handling ──────────────────────────────────────────────────────

  /** Retries exhausted: surface it on the row (FAILED) so it is never mistaken for "clear". The sweep retries it later. */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<AnomalyJob> | undefined, err: Error): Promise<void> {
    try {
      if (!job || job.name !== DETECT_ANOMALY_JOB) return;
      const maxAttempts = job.opts?.attempts ?? DETECT_ANOMALY_JOB_OPTS.attempts;
      if (job.attemptsMade < maxAttempts) return; // BullMQ will retry
      const res = await this.prisma.request.updateMany({
        where: { id: job.data.requestId, anomalyStatus: { in: OPEN_STATES } },
        data: { anomalyStatus: 'FAILED', anomalyEvaluatedAt: new Date() },
      });
      this.logger.error(
        `Anomaly evaluation FAILED for request ${job.data.requestId} after ${job.attemptsMade} attempts (${err?.message}); ` +
          `${res.count ? 'row marked FAILED, the recovery sweep will retry' : 'no ledger row yet'}`,
      );
    } catch (e: any) {
      this.logger.error(`Could not record anomaly failure: ${e?.message}`); // never throw from an event handler
    }
  }

  // ── Recovery sweep ────────────────────────────────────────────────────────

  /**
   * Re-queues every request the normal path lost, straight from Postgres:
   *   PENDING older than minAge        (queue publish failed, Redis lost the job, worker died)
   *   FAILED not retried for failedRetry (retries were exhausted)
   * and finally declares PENDING rows older than maxAge FAILED (terminal) so nothing stays "pending" forever.
   * Safe to run concurrently or repeatedly: evaluation is idempotent.
   */
  async sweep(): Promise<{ requeued: number; expired: number }> {
    const cfg = sweepConfig();
    const now = Date.now();

    const expired = await this.prisma.request.updateMany({
      where: { anomalyStatus: 'PENDING', isBlocked: false, createdAt: { lt: new Date(now - cfg.maxAgeMs) } },
      data: { anomalyStatus: 'FAILED', anomalyEvaluatedAt: new Date() },
    });

    const rows = await this.prisma.request.findMany({
      where: {
        isBlocked: false,
        createdAt: { gte: new Date(now - cfg.maxAgeMs), lte: new Date(now - cfg.minAgeMs) },
        OR: [{ anomalyStatus: 'PENDING' }, { anomalyStatus: 'FAILED', anomalyEvaluatedAt: { lt: new Date(now - cfg.failedRetryMs) } }],
      },
      orderBy: { createdAt: 'asc' },
      take: cfg.batch,
      select: { id: true, projectId: true, model: true, costEstimate: true, totalTokens: true, createdAt: true },
    });

    // A job id per row per hour: re-adding within the hour is a no-op, a row stuck longer is re-queued
    const bucket = Math.floor(now / 3_600_000);
    let requeued = 0;
    for (const r of rows) {
      const job: AnomalyJob = {
        requestId: r.id,
        projectId: r.projectId,
        model: r.model,
        costEstimate: Number(r.costEstimate),
        totalTokens: r.totalTokens,
        createdAt: r.createdAt.toISOString(),
      };
      try {
        await this.queue.add(DETECT_ANOMALY_JOB, job, { ...DETECT_ANOMALY_JOB_OPTS, jobId: `${r.id}-sweep-${bucket}` });
        requeued++;
      } catch (err: any) {
        this.logger.warn(`Sweep could not re-queue ${r.id}: ${err?.message}`);
      }
    }
    if (requeued || expired.count) this.logger.warn(`Anomaly sweep: re-queued ${requeued}, expired ${expired.count}`);
    return { requeued, expired: expired.count };
  }
}
