import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { BudgetService } from '@/modules/budget/budget.service';
import { REQUEST_LEDGER_QUEUE, PERSIST_ATTEMPT_JOB, AttemptRowJob, LedgerRowJob } from './request-ledger.queue';

/**
 * Retries rows whose insert failed on the request path:
 *  - request rows (the charge is already settled in Redis; until the row lands, reconciliation
 *    treats the request as pending and will not lower spend below it), and
 *  - failed-call audit rows (`persist-attempt`; they carry no spend).
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

  async process(job: Job<LedgerRowJob | AttemptRowJob>): Promise<void> {
    if (job.name === PERSIST_ATTEMPT_JOB) return this.persistAttempt(job as Job<AttemptRowJob>);
    return this.persistRequest(job as Job<LedgerRowJob>);
  }

  private async persistAttempt(job: Job<AttemptRowJob>): Promise<void> {
    const row = job.data;
    try {
      await this.prisma.requestAttempt.create({ data: { ...(row as any), createdAt: new Date(row.createdAt) } });
    } catch (err: any) {
      if (err?.code === 'P2002') return; // the original insert actually committed
      this.logger.error(`Attempt retry ${job.attemptsMade + 1} failed for ${row.id} (${err?.code ?? err?.name})`);
      throw err;
    }
    this.logger.log(`Failed-call audit row persisted on retry for ${row.id}`);
  }

  private async persistRequest(job: Job<LedgerRowJob>): Promise<void> {
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
