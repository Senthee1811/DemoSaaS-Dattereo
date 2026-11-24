import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { BudgetService } from '@/modules/budget/budget.service';
import { AnomalyService } from './anomaly.service';
import {
  ANOMALY_QUEUE,
  DETECT_ANOMALY_JOB_OPTS,
  AnomalyJob,
  anomalyAlertDedupKey,
  anomalyAlertWindowSeconds,
} from './anomaly.queue';

const HISTORY_SIZE = 40;

/**
 * Scores a completed request against the project's recent history and raises at most one
 * alert per project+model per window.
 *
 * This runs entirely off the request path. Nothing here can change a budget decision: the hold
 * was settled and the ledger written before the job was queued, and every failure here is a
 * BullMQ retry, never an error to the caller.
 *
 * Steps (each safe to repeat, since BullMQ may retry the whole job):
 *  1. Score against the previous 40 non-blocked rows strictly BEFORE this request.
 *  2. If anomalous, flag the ledger row (updateMany by id: a repeat sets the same values).
 *  3. Claim the dedupe key (Redis SET NX EX). Only the claimant records an alert; if recording
 *     fails the claim is released so the retry can try again.
 *  4. If the ledger row did not exist yet (its write is in the ledger retry queue), fail the job
 *     so it is retried later and the flag lands. The alert is already raised and deduped, so the
 *     retry cannot alert twice.
 */
@Processor(ANOMALY_QUEUE)
export class AnomalyProcessor extends WorkerHost {
  private readonly logger = new Logger(AnomalyProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly anomaly: AnomalyService,
    private readonly budget: BudgetService,
  ) {
    super();
  }

  async process(job: Job<AnomalyJob>): Promise<void> {
    const { requestId, projectId, model, costEstimate, totalTokens, createdAt } = job.data;
    const at = new Date(createdAt);

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
    if (!result.isAnomaly) return;

    const flagged = await this.prisma.request.updateMany({
      where: { id: requestId },
      data: { isAnomaly: true, anomalyReason: result.reason ?? null },
    });

    await this.alertOncePerWindow({ projectId, model, costEstimate, reason: result.reason });

    const maxAttempts = job.opts?.attempts ?? DETECT_ANOMALY_JOB_OPTS.attempts;
    if (flagged.count === 0 && job.attemptsMade + 1 < maxAttempts) {
      throw new Error(`Ledger row for ${requestId} is not persisted yet; retrying to flag it`);
    }
    if (flagged.count === 0) {
      this.logger.warn(`Anomaly for request ${requestId} could not be flagged on the ledger (row never appeared)`);
    }
  }

  private async alertOncePerWindow(p: { projectId: string; model: string; costEstimate: number; reason?: string }): Promise<void> {
    const key = anomalyAlertDedupKey(p.projectId, p.model);
    const claimed = await this.redis.acquireOnce(key, anomalyAlertWindowSeconds());
    if (claimed === null) {
      // Redis is down: do not guess (that would risk an alert storm). Retry later.
      throw new Error('Alert dedupe store unavailable; retrying');
    }
    if (!claimed) {
      this.logger.debug(`Anomaly alert suppressed for project ${p.projectId} / ${p.model} (already alerted this window)`);
      return;
    }

    const recorded = await this.budget.recordAlert({
      projectId: p.projectId,
      thresholdType: 'ANOMALY_DETECTED',
      thresholdValue: p.costEstimate,
      title: `⚡ Spend Spike Detected: ${p.model}`,
      message: p.reason || `Abnormal token volume on ${p.model}`,
    });
    if (!recorded) {
      await this.redis.delCache(key); // nothing was recorded: let the retry alert
      throw new Error('Alert could not be recorded; retrying');
    }
  }
}
