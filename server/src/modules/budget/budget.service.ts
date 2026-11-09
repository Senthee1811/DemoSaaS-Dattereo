import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';

export interface BudgetGuardrailResult {
  canProceed: boolean;
  isHardBlocked: boolean;
  blockReason?: string;
  budgetMonthly: number;
  currentMonthlySpend: number;
  utilizationPct: number;
  reservedAmount?: number;
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
        const reason = `Budget Exceeded: Monthly cap of $${budgetMonthly.toFixed(2)} reached ($${currentMonthlySpend.toFixed(2)} spent)`;
        
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
    maxEstimatedCost: number,
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

      // Execute atomic reservation via Redis Lua script
      const reservation = await this.redisService.reserveBudget(
        projectId,
        maxEstimatedCost,
        budgetMonthly,
      );

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

      const { success, currentSpend, currentReserved } = reservation;
      const totalCommitted = currentSpend + currentReserved;
      const utilizationPct = budgetMonthly > 0 ? (totalCommitted / budgetMonthly) * 100 : 0;

      if (!success && project.budgetHardBlockEnabled) {
        const reason = `Budget Cap Exceeded: Committed spend ($${totalCommitted.toFixed(2)}) + estimated request cost ($${maxEstimatedCost.toFixed(4)}) exceeds monthly cap of $${budgetMonthly.toFixed(2)}.`;

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
        reservedAmount: maxEstimatedCost,
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
   * Reconcile atomic reservation with verified actual provider token usage.
   */
  async reconcileReservation(
    projectId: string,
    estimatedAmount: number,
    actualCost: number,
  ): Promise<{ newSpend: number; newReserved: number } | null> {
    return this.redisService.reconcileBudget(projectId, estimatedAmount, actualCost);
  }

  /**
   * Release reserved capacity when request fails or is canceled.
   */
  async releaseReservation(projectId: string, estimatedAmount: number): Promise<void> {
    return this.redisService.releaseReservation(projectId, estimatedAmount);
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
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

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
          status: 'SENT',
        },
      });

      this.logger.log(`[ALERT DISPATCHED] ${params.title}: ${params.message}`);
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
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const aggregate = await this.prisma.request.aggregate({
      where: {
        projectId,
        createdAt: { gte: firstDayOfMonth },
        isBlocked: false,
      },
      _sum: { costEstimate: true },
    });

    const trueSpend = Number(aggregate._sum.costEstimate || 0);
    await this.redisService.setProjectSpend(projectId, trueSpend);

    this.logger.log(`Reconciled spend for project ${projectId}: $${trueSpend.toFixed(4)}`);
  }
}
