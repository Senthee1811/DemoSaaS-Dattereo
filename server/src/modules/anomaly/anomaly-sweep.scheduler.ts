import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ANOMALY_QUEUE, SWEEP_ANOMALY_JOB, sweepConfig } from './anomaly.queue';

/**
 * Registers the repeatable recovery sweep (stable jobId, so restarts and multiple instances never
 * stack schedules). The sweep reads Postgres, so it recovers requests even when the queue itself lost jobs.
 */
@Injectable()
export class AnomalySweepScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnomalySweepScheduler.name);

  constructor(@InjectQueue(ANOMALY_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    const { everyMs } = sweepConfig();
    try {
      await this.queue.add(
        SWEEP_ANOMALY_JOB,
        {},
        { repeat: { every: everyMs }, jobId: SWEEP_ANOMALY_JOB, removeOnComplete: 20, removeOnFail: 50 },
      );
      // Also once at boot: after a Redis wipe or an outage this is what recovers the backlog immediately
      await this.queue.add(SWEEP_ANOMALY_JOB, {}, { removeOnComplete: true, removeOnFail: 20 });
      this.logger.log(`Anomaly recovery sweep scheduled every ${Math.round(everyMs / 1000)}s`);
    } catch (err: any) {
      this.logger.error(`Could not schedule the anomaly recovery sweep: ${err.message}`);
    }
  }
}
