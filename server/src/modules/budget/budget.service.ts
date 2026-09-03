import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

export interface BudgetGuardrailResult {
  canProceed: boolean;
  isHardBlocked: boolean;
  blockReason?: string;
  budgetMonthly: number;
  currentMonthlySpend: number;
  utilizationPct: number;
}

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pre-flight synchronous budget verification (Fail-Closed Policy)
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

      // Calculate current month's aggregate spend
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const aggregate = await this.prisma.request.aggregate({
        where: {
          projectId,
          createdAt: { gte: firstDayOfMonth },
          isBlocked: false,
        },
        _sum: {
          costEstimate: true,
        },
      });

      const currentMonthlySpend = Number(aggregate._sum.costEstimate || 0);
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
   * Post-request budget check to trigger 80% soft warning alerts
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
        // Check if an 80% alert was already sent this month
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
}
