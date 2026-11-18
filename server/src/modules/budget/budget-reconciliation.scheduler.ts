import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export const BUDGET_RECONCILIATION_QUEUE = 'budget-reconciliation';

/**
 * Registers the repeatable reconciliation job. Redis spend counters are the
 * fast path for the gateway; this job periodically re-derives them from the
 * Postgres ledger so a Redis flush/restart can never reset spend to $0 for long,
 * and lifts automatic budget blocks after the month rolls over.
 */
@Injectable()
export class BudgetReconciliationScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(BudgetReconciliationScheduler.name);

  constructor(@InjectQueue(BUDGET_RECONCILIATION_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    const everyMs = Number(process.env.BUDGET_RECONCILE_INTERVAL_MS) || 5 * 60 * 1000;
    try {
      await this.queue.add(
        'reconcile-all-projects',
        {},
        {
          repeat: { every: everyMs },
          jobId: 'reconcile-all-projects',
          removeOnComplete: 50,
          removeOnFail: 50,
        },
      );
      // Run once at boot so counters are correct immediately after a Redis restart
      await this.queue.add('reconcile-on-boot', {}, { removeOnComplete: true, removeOnFail: 20 });
      this.logger.log(`Budget reconciliation scheduled every ${Math.round(everyMs / 1000)}s`);
    } catch (err: any) {
      this.logger.error(`Could not schedule budget reconciliation: ${err.message}`);
    }
  }
}
