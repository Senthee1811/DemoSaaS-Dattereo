import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import {
  MODEL_CATALOG_QUEUE,
  ModelCatalogProcessor,
  ModelCatalogScheduler,
} from './model-catalog.scheduler';

@Global()
@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: MODEL_CATALOG_QUEUE,
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
  controllers: [PricingController],
  providers: [PricingService, ModelCatalogScheduler, ModelCatalogProcessor],
  exports: [PricingService],
})
export class PricingModule {}
