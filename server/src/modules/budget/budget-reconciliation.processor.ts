import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { BudgetService } from './budget.service';

@Processor('budget-reconciliation')
export class BudgetReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(BudgetReconciliationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetService: BudgetService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Running budget reconciliation job: ${job.name}`);

    try {
      const projects = await this.prisma.project.findMany({
        select: { id: true, name: true },
      });

      for (const project of projects) {
        // One bad project must not stop reconciliation for every other tenant
        try {
          await this.budgetService.reconcileProjectSpend(project.id);
        } catch (err: any) {
          this.logger.warn(`Reconciliation failed for project ${project.id}: ${err.message}`);
        }
      }

      this.logger.log(`Reconciliation complete for ${projects.length} projects`);
    } catch (err: any) {
      this.logger.error(`Reconciliation job failed: ${err.message}`);
      throw err;
    }
  }
}
