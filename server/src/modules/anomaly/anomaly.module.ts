import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { AnomalyService } from './anomaly.service';
import { AnomalyProcessor } from './anomaly.processor';
import { AnomalySweepScheduler } from './anomaly-sweep.scheduler';
import { ANOMALY_QUEUE } from './anomaly.queue';

@Global()
@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: ANOMALY_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host') || 'localhost',
          port: configService.get<number>('redis.port') || 6379,
          password: configService.get<string>('redis.password') || undefined,
        },
      }),
    }),
  ],
  providers: [AnomalyService, AnomalyProcessor, AnomalySweepScheduler],
  exports: [AnomalyService],
})
export class AnomalyModule {}
