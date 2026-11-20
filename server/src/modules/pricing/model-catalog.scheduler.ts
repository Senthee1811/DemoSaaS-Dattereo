import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { PricingService } from './pricing.service';
import { formatSyncReport, syncModelCatalog } from './model-catalog.sync';

export const MODEL_CATALOG_QUEUE = 'model-catalog-sync';

/** Registers the daily availability check (BullMQ repeatable job, stable jobId so restarts don't stack). */
@Injectable()
export class ModelCatalogScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ModelCatalogScheduler.name);

  constructor(@InjectQueue(MODEL_CATALOG_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    const everyMs = Number(process.env.MODEL_CATALOG_SYNC_INTERVAL_MS) || 24 * 60 * 60 * 1000;
    try {
      await this.queue.add(
        'check-provider-models',
        {},
        {
          repeat: { every: everyMs },
          jobId: 'check-provider-models',
          removeOnComplete: 30,
          removeOnFail: 30,
        },
      );
      this.logger.log(`Model availability check scheduled every ${Math.round(everyMs / 3_600_000)}h`);
    } catch (err: any) {
      this.logger.error(`Could not schedule model availability check: ${err.message}`);
    }
  }
}

@Processor(MODEL_CATALOG_QUEUE)
export class ModelCatalogProcessor extends WorkerHost {
  private readonly logger = new Logger(ModelCatalogProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const results = await syncModelCatalog(this.prisma as any);
    const flagged = results.flatMap((r) => r.missing);
    const report = formatSyncReport(results);
    if (flagged.length > 0) {
      this.logger.warn(`Models no longer listed by their provider:\n${report}`);
    } else {
      this.logger.log(`Model availability check:\n${report}`);
    }
    // Pick up the new providerStatus / retiresAt values
    await this.pricing.refreshPricingFromDb();
  }
}
