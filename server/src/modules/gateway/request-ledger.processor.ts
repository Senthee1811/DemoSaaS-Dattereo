import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { BudgetService } from '@/modules/budget/budget.service';
import { REQUEST_LEDGER_QUEUE, LedgerRowJob } from './request-ledger.queue';

/**
 * Retries request rows whose insert failed after the provider call succeeded.
 * The charge is already settled in Redis; until the row lands, reconciliation
 * treats the request as pending and will not lower spend below it.
 */
@Processor(REQUEST_LEDGER_QUEUE)
export class RequestLedgerProcessor extends WorkerHost {
  private readonly logger = new Logger(RequestLedgerProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetService: BudgetService,
  ) {
    super();
  }

  async process(job: Job<LedgerRowJob>): Promise<void> {
    const row = job.data;
    const createdAt = new Date(row.createdAt);
    try {
      await this.prisma.request.create({ data: { ...(row as any), createdAt } });
    } catch (err: any) {
      // P2002 = unique violation: the original insert actually committed. Done.
      if (err?.code !== 'P2002') {
        this.logger.error(`Ledger retry ${job.attemptsMade + 1} failed for request ${row.id} (${err?.code ?? err?.name})`);
        throw err;
      }
    }
    await this.budgetService.clearPendingPersist(row.projectId, row.id, createdAt);
    this.logger.log(`Ledger row persisted on retry for request ${row.id}`);
  }
}
