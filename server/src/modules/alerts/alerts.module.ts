import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertDispatchService } from './alert-dispatch.service';
import { AlertDeliveryProcessor } from './alert-delivery.processor';
import { ALERT_DELIVERY_QUEUE } from './alert-delivery.queue';

@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: ALERT_DELIVERY_QUEUE,
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
  controllers: [AlertsController],
  providers: [AlertsService, AlertDispatchService, AlertDeliveryProcessor],
  exports: [AlertsService, AlertDispatchService],
})
export class AlertsModule {}
