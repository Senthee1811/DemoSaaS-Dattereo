import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { BullModule, InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { AttributionService } from './attribution.service';
import { ForecastService } from './forecast.service';
import { InsightsController } from './insights.controller';
import { InsightsDataService } from './insights.data';
import { InvestigationService } from './investigation.service';
import { ModelComparisonService } from './model-comparison.service';
import { RecommendationsService } from './recommendations.service';

export const INSIGHTS_QUEUE = 'insights';
export const GENERATE_ALL_JOB = 'generate-recommendations';

/** Re-evaluates recommendations for every organization that had traffic recently. Deterministic; no model is called. */
@Processor(INSIGHTS_QUEUE)
export class InsightsProcessor extends WorkerHost {
  private readonly logger = new Logger(InsightsProcessor.name);
  constructor(private readonly prisma: PrismaService, private readonly recommendations: RecommendationsService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name !== GENERATE_ALL_JOB) return;
    const since = new Date(Date.now() - 7 * 86_400_000);
    const orgs = await this.prisma.project.findMany({ where: { requests: { some: { createdAt: { gte: since } } } }, select: { orgId: true }, distinct: ['orgId'] });
    let created = 0;
    for (const { orgId } of orgs) {
      try {
        created += (await this.recommendations.generate(orgId)).created; // one org's failure does not stop the others
      } catch (err: any) {
        this.logger.warn(`Recommendation generation failed for org ${orgId}: ${err?.message}`);
      }
    }
    return { organizations: orgs.length, created };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, err: Error) {
    this.logger.error(`Insights job ${job?.name} failed: ${err.message}`);
  }
}

@Injectable()
export class InsightsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(InsightsScheduler.name);
  constructor(@InjectQueue(INSIGHTS_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    const every = Number(process.env.INSIGHTS_INTERVAL_MS) || 6 * 3_600_000;
    try {
      await this.queue.add(GENERATE_ALL_JOB, {}, { repeat: { every }, jobId: GENERATE_ALL_JOB, removeOnComplete: 20, removeOnFail: 50 });
    } catch (err: any) {
      this.logger.error(`Could not schedule recommendation generation: ${err.message}`);
    }
  }
}

@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: INSIGHTS_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { host: config.get<string>('redis.host') || 'localhost', port: config.get<number>('redis.port') || 6379, password: config.get<string>('redis.password') || undefined },
      }),
    }),
  ],
  controllers: [InsightsController],
  providers: [InsightsDataService, AttributionService, ForecastService, InvestigationService, ModelComparisonService, RecommendationsService, InsightsProcessor, InsightsScheduler],
  exports: [RecommendationsService],
})
export class InsightsModule {}
