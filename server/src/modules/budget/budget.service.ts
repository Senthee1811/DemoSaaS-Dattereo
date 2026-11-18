import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService, BudgetBucket } from '@/modules/redis/redis.service';
import { utcMonthStart } from '@/common/billing-period';

/** Prefix for blocks applied automatically by the budget engine (vs. manual admin freezes). */
export const AUTO_BLOCK_PREFIX = 'Budget Cap Exceeded:';

export interface BudgetGuardrailResult {
  canProceed: boolean;
  isHardBlocked: boolean;
  blockReason?: string;
  budgetMonthly: number;
  currentMonthlySpend: number;
  utilizationPct: number;
  reservedAmount?: number;
  /** Machine-readable reason when blocked by a cap other than the project's monthly budget. */
  blockCode?: 'key_budget_exceeded';
  /** Present when the request may proceed; settle or release it by request ID. */
  hold?: BudgetHold;
}

/** The gateway key a request came through (absent for dashboard-session requests). */
export interface GatewayKeyLimits {
  id: string;
  /** The key's own monthly USD budget; null = only the project budget applies. */
  budgetMonthly: number | null;
}

/** A request's budget hold: identified by the request ID, spread over one or more buckets. */
export interface BudgetHold {
  requestId: string;
  amount: number;
  buckets: BudgetBucket[];
}

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Pre-flight synchronous budget verification (Fail-Closed Policy)
   * 
   * Uses Redis-cached spend counters for speed. If Redis is unavailable,
   * blocks the request (fail-closed) — never silently allows it through.
   */
  async checkBudgetGuardrail(projectId: string): Promise<BudgetGuardrailResult> {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        return {
          canProceed: false,
          isHardBlocked: true,
          blockReason: `Project ${projectId} not found. Fail-closed governance policy enforced.`,
          budgetMonthly: 0,
          currentMonthlySpend: 0,
          utilizationPct: 100,
        };
      }

      // Check manual emergency block
      if (project.isBlocked) {
        return {
          canProceed: false,
          isHardBlocked: true,
          blockReason: project.blockReason || `Project ${project.name} is currently hard-blocked by an administrator.`,
          budgetMonthly: Number(project.budgetMonthly),
          currentMonthlySpend: 0,
          utilizationPct: 100,
        };
      }

      // Try Redis-cached spend first (fast path)
      const cachedSpend = await this.redisService.getProjectSpend(projectId);

      let currentMonthlySpend: number;

      if (cachedSpend !== null) {
        // Redis is available — use cached value
        currentMonthlySpend = cachedSpend;
      } else if (!this.redisService.isConnected) {
        // FAIL-CLOSED: Redis is unavailable — hard-block the request.
        // Per PRD: "If Redis is unreachable, block the request and return a governance error — 
        // do not fall back to allowing it." We must NOT query Postgres as a fallback.
        this.logger.error(
          `FAIL-CLOSED: Redis unavailable for project ${projectId}. Blocking request. governance_unavailable.`,
        );
        return {
          canProceed: false,
          isHardBlocked: true,
          blockReason: 'Governance engine unavailable (Redis unreachable). Fail-closed policy enforced — all requests blocked until governance infrastructure is restored.',
          budgetMonthly: Number(project.budgetMonthly),
          currentMonthlySpend: 0,
          utilizationPct: 100,
        };
      } else {
        // Redis is connected but returned null — means no spend recorded yet
        currentMonthlySpend = 0;
      }

      const budgetMonthly = Number(project.budgetMonthly);
      const utilizationPct = budgetMonthly > 0 ? (currentMonthlySpend / budgetMonthly) * 100 : 0;

      // Fail-closed threshold enforcement
      if (project.budgetHardBlockEnabled && currentMonthlySpend >= budgetMonthly) {
        const reason = `${AUTO_BLOCK_PREFIX} Monthly cap of $${budgetMonthly.toFixed(2)} reached ($${currentMonthlySpend.toFixed(2)} spent)`;
        
        // Auto-update project isBlocked in DB
        await this.prisma.project.update({
          where: { id: projectId },
          data: { isBlocked: true, blockReason: reason },
        });

        // Trigger Alert
        await this.recordAlert({
          projectId,
          thresholdType: 'HARD_BLOCK',
          thresholdValue: budgetMonthly,
          title: `🛑 Hard-Block Activated: ${project.name}`,
          message: reason,
        });

        return {
          canProceed: false,
          isHardBlocked: true,
          blockReason: reason,
          budgetMonthly,
          currentMonthlySpend,
          utilizationPct,
        };
      }

      return {
        canProceed: true,
        isHardBlocked: false,
        budgetMonthly,
        currentMonthlySpend,
        utilizationPct,
      };
    } catch (err: any) {
      this.logger.error(`Budget guardrail check failed: ${err.message}. Fail-closed active.`);
      return {
        canProceed: false,
        isHardBlocked: true,
        blockReason: 'Governance engine unavailable. Fail-closed policy enforced.',
        budgetMonthly: 0,
        currentMonthlySpend: 0,
        utilizationPct: 100,
      };
    }
  }

  /**
   * Atomic Pre-Flight Budget Capacity Reservation (Concurrency-Safe)
   * Prevents parallel requests from simultaneously breaching the budget cap.
   */
  async reserveCapacity(
    projectId: string,
    requestId: string,
    maxEstimatedCost: number,
    gatewayKey?: GatewayKeyLimits,
  ): Promise<BudgetGuardrailResult> {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        return {
          canProceed: false,
          isHardBlocked: true,
          blockReason: `Project ${projectId} not found. Fail-closed governance policy enforced.`,
          budgetMonthly: 0,
          currentMonthlySpend: 0,
          utilizationPct: 100,
        };
      }

      if (project.isBlocked) {
        return {
          canProceed: false,
          isHardBlocked: true,
          blockReason: project.blockReason || `Project ${project.name} is currently hard-blocked.`,
          budgetMonthly: Number(project.budgetMonthly),
          currentMonthlySpend: 0,
          utilizationPct: 100,
        };
      }

      const budgetMonthly = Number(project.budgetMonthly);

      // Atomic per-request hold via Redis Lua script (expired holds are dropped first).
      // Every cap is checked in the same script: the project's monthly budget and,
      // for gateway-key traffic, the key's own monthly budget. With hard-block off
      // the project bucket is tracked but uncapped (soft overage).
      const buckets = [
        this.redisService.projectMonthBucket(projectId, project.budgetHardBlockEnabled ? budgetMonthly : null),
      ];
      if (gatewayKey) {
        buckets.push(this.redisService.keyMonthBucket(gatewayKey.id, gatewayKey.budgetMonthly));
      }
      const reservation = await this.redisService.reserveHold(requestId, maxEstimatedCost, buckets);

      // Fail-closed if Redis is disconnected or failed
      if (!reservation) {
        this.logger.error(`FAIL-CLOSED: Redis atomic reservation failed for project ${projectId}.`);
        return {
          canProceed: false,
          isHardBlocked: true,
          blockReason: 'Governance engine unavailable (Redis unreachable). Fail-closed policy enforced.',
          budgetMonthly,
          currentMonthlySpend: 0,
          utilizationPct: 100,
        };
      }

      if (reservation.status === 'rejected' && reservation.failedBucket?.name === 'key_monthly') {
        const cap = reservation.failedBucket.cap ?? 0;
        const remaining = Math.max(0, cap - reservation.spend - reservation.held);
        return {
          canProceed: false,
          isHardBlocked: false,
          blockCode: 'key_budget_exceeded',
          blockReason: `This API key's monthly budget of ${cap.toFixed(4)} would be exceeded (worst-case cost ${maxEstimatedCost.toFixed(4)}, remaining ${remaining.toFixed(4)}).`,
          budgetMonthly,
          currentMonthlySpend: 0,
          utilizationPct: 100,
        };
      }

      const success = reservation.status !== 'rejected';
      const currentSpend = reservation.spend;
      const currentReserved = reservation.held;
      const totalCommitted = currentSpend + currentReserved;
      const utilizationPct = budgetMonthly > 0 ? (totalCommitted / budgetMonthly) * 100 : 0;

      if (!success && project.budgetHardBlockEnabled) {
        const capReached = currentSpend >= budgetMonthly;

        if (!capReached) {
          // Only THIS request's worst-case cost doesn't fit in the remaining budget.
          // Reject it, but don't freeze the project: smaller requests can still fit,
          // and freezing here would flap (reconciliation lifts it) and spam alerts.
          const remaining = Math.max(0, budgetMonthly - totalCommitted);
          return {
            canProceed: false,
            isHardBlocked: false,
            blockReason: `Request worst-case cost ($${maxEstimatedCost.toFixed(4)}) exceeds the remaining monthly budget ($${remaining.toFixed(4)}). Lower max_tokens or raise the project budget.`,
            budgetMonthly,
            currentMonthlySpend: currentSpend,
            utilizationPct,
          };
        }

        // Actual settled spend has reached the cap: freeze the project until the
        // month rolls over or an admin raises the budget.
        const reason = `${AUTO_BLOCK_PREFIX} Monthly spend ($${currentSpend.toFixed(4)}) reached the cap of $${budgetMonthly.toFixed(2)}.`;

        await this.prisma.project.update({
          where: { id: projectId },
          data: { isBlocked: true, blockReason: reason },
        });

        await this.recordAlert({
          projectId,
          thresholdType: 'HARD_BLOCK',
          thresholdValue: budgetMonthly,
          title: `🛑 Hard-Block Activated: ${project.name}`,
          message: reason,
        });

        return {
          canProceed: false,
          isHardBlocked: true,
          blockReason: reason,
          budgetMonthly,
          currentMonthlySpend: currentSpend,
          utilizationPct,
        };
      }

      return {
        canProceed: true,
        isHardBlocked: false,
        budgetMonthly,
        currentMonthlySpend: currentSpend,
        utilizationPct,
        // If the Lua reservation was refused (over budget, hard-block disabled) the
        // request proceeds as soft-overage with NOTHING held; settling still charges
        // the actual cost to every bucket.
        reservedAmount: success ? maxEstimatedCost : 0,
        hold: { requestId, amount: success ? maxEstimatedCost : 0, buckets },
      };
    } catch (err: any) {
      this.logger.error(`reserveCapacity failed: ${err.message}. Fail-closed active.`);
      return {
        canProceed: false,
        isHardBlocked: true,
        blockReason: 'Governance engine unavailable. Fail-closed policy enforced.',
        budgetMonthly: 0,
        currentMonthlySpend: 0,
        utilizationPct: 100,
      };
    }
  }

  /**
   * Settle a request's hold with its verified actual cost. Idempotent per
   * request ID: a second settle (or a settle after release) changes nothing.
   * Returns null if Redis was unavailable.
   */
  async settleHold(hold: BudgetHold, actualCost: number): Promise<{ applied: boolean; spend: number } | null> {
    return this.redisService.settleHold(hold.requestId, actualCost, hold.buckets);
  }

  /** Mark a request as settled in Redis but not yet in the ledger (call before settleHold). */
  async markPendingPersist(projectId: string, requestId: string, at: Date): Promise<void> {
    await this.redisService.markPendingPersist(projectId, requestId, at);
  }

  /** The request's ledger row has been written. */
  async clearPendingPersist(projectId: string, requestId: string, at: Date): Promise<void> {
    await this.redisService.clearPendingPersist(projectId, requestId, at);
  }

  /** Release a request's hold without charging (upstream failure). Idempotent per request ID. */
  async releaseHold(hold: BudgetHold): Promise<void> {
    await this.redisService.releaseHold(hold.requestId, hold.buckets);
  }

  /**
   * Post-request budget check to trigger 80% soft warning alerts.
   * Idempotent — won't re-fire if already triggered this month.
   */
  async evaluatePostRequestThresholds(projectId: string, currentSpend: number): Promise<void> {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        include: { alertConfig: true },
      });

      if (!project) return;

      const budget = Number(project.budgetMonthly);
      const warningPct = project.alertConfig ? Number(project.alertConfig.warningThresholdPct) : 80.0;
      const warningThreshold = budget * (warningPct / 100);

      if (currentSpend >= warningThreshold && currentSpend < budget) {
        // Check if an 80% alert was already sent this month (idempotent)
        const now = new Date();
        const firstDayOfMonth = utcMonthStart(now);

        const existing = await this.prisma.budgetAlert.findFirst({
          where: {
            projectId,
            thresholdType: 'PERCENT_80',
            triggeredAt: { gte: firstDayOfMonth },
          },
        });

        if (!existing) {
          await this.recordAlert({
            projectId,
            thresholdType: 'PERCENT_80',
            thresholdValue: warningThreshold,
            title: `⚠️ Budget Warning (80%): ${project.name}`,
            message: `Project ${project.name} has utilized ${((currentSpend / budget) * 100).toFixed(1)}% of its monthly budget ($${currentSpend.toFixed(2)} / $${budget.toFixed(2)}).`,
          });
        }
      }
    } catch (err: any) {
      this.logger.error(`Post-request threshold evaluation error: ${err.message}`);
    }
  }

  /**
   * Records and dispatches a budget alert
   */
  async recordAlert(params: {
    projectId: string;
    thresholdType: 'PERCENT_80' | 'HARD_BLOCK' | 'ANOMALY_DETECTED';
    thresholdValue: number;
    title: string;
    message: string;
    channel?: 'EMAIL' | 'SLACK' | 'IN_APP';
  }): Promise<void> {
    try {
      await this.prisma.budgetAlert.create({
        data: {
          projectId: params.projectId,
          thresholdType: params.thresholdType,
          thresholdValue: params.thresholdValue,
          title: params.title,
          message: params.message,
          channel: params.channel || 'IN_APP',
          isRead: false,
          // No external delivery exists yet: the alert is recorded in-app only
          status: 'RECORDED',
        },
      });

      this.logger.log(`[ALERT RECORDED in-app] ${params.title}`);
    } catch (err: any) {
      this.logger.error(`Failed to record alert: ${err.message}`);
    }
  }

  /**
   * Reconcile Redis spend counter with actual DB aggregate.
   * Called by BullMQ reconciliation processor.
   */
  async reconcileProjectSpend(projectId: string): Promise<void> {
    const now = new Date();
    const firstDayOfMonth = utcMonthStart(now);

    // Read the ledger activity counter BEFORE the DB, so any request that settles
    // or persists while we aggregate is detected and spend is not lowered.
    const seqBefore = await this.redisService.getLedgerSeq(projectId, now);
    if (seqBefore === null) {
      this.logger.warn(`Skipping reconciliation for project ${projectId}: Redis unavailable`);
      return;
    }

    const aggregate = await this.prisma.request.aggregate({
      where: {
        projectId,
        createdAt: { gte: firstDayOfMonth },
        isBlocked: false,
      },
      _sum: { costEstimate: true },
    });

    const ledgerSpend = Number(aggregate._sum.costEstimate || 0);

    // Per-key monthly spend, from the same ledger, under the same in-flight guard
    const [keys, perKey] = await Promise.all([
      this.prisma.gatewayApiKey.findMany({ where: { projectId }, select: { id: true } }),
      this.prisma.request.groupBy({
        by: ['gatewayKeyId'],
        where: { projectId, createdAt: { gte: firstDayOfMonth }, isBlocked: false, gatewayKeyId: { not: null } },
        _sum: { costEstimate: true },
      }),
    ]);
    const keySums = new Map(perKey.map((r) => [r.gatewayKeyId, Number(r._sum.costEstimate || 0)]));
    for (const k of keys) {
      await this.redisService.reconcileBucketSpend(
        this.redisService.keyMonthBucket(k.id, null, now),
        projectId,
        keySums.get(k.id) ?? 0,
        seqBefore,
        now,
      );
    }
    // Atomically: drop expired holds, then set spend to the ledger sum only if
    // nothing is in flight; otherwise only ever raise it (repairs a Redis flush).
    const reconciled = await this.redisService.reconcileProjectSpend(projectId, ledgerSpend, seqBefore, now);
    if (!reconciled) return;
    const trueSpend = reconciled.spend;

    // Lift automatic budget blocks once spend is back under the cap
    // (new billing month, or an admin raised the budget). Manual freezes are untouched.
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (
      project?.isBlocked &&
      project.blockReason?.startsWith(AUTO_BLOCK_PREFIX) &&
      trueSpend < Number(project.budgetMonthly)
    ) {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { isBlocked: false, blockReason: null },
      });
      this.logger.log(`Lifted automatic budget block for project ${projectId}`);
    }

    this.logger.debug(`Reconciled spend for project ${projectId}: $${trueSpend.toFixed(4)}`);
  }
}
