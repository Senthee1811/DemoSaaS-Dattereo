import { Global, Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationDeliveryProcessor } from './notification-delivery.processor';
import { NOTIFICATION_QUEUE, REQUEUE_STALE_JOB } from './notification.events';

/** Registers the repeatable recovery job (stable id: restarts and several instances never stack schedules). */
@Injectable()
export class NotificationRecoveryScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationRecoveryScheduler.name);
  constructor(@InjectQueue(NOTIFICATION_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    const every = Number(process.env.NOTIFICATION_RECOVERY_INTERVAL_MS) || 5 * 60_000;
    try {
      await this.queue.add(REQUEUE_STALE_JOB, {}, { repeat: { every }, jobId: REQUEUE_STALE_JOB, removeOnComplete: 20, removeOnFail: 50 });
      await this.queue.add(REQUEUE_STALE_JOB, {}, { removeOnComplete: true, removeOnFail: 20 }); // once at boot
    } catch (err: any) {
      this.logger.error(`Could not schedule notification recovery: ${err.message}`);
    }
  }
}

@Global()
@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: NOTIFICATION_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host') || 'localhost',
          port: config.get<number>('redis.port') || 6379,
          password: config.get<string>('redis.password') || undefined,
        },
      }),
    }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationDeliveryProcessor, NotificationRecoveryScheduler],
  exports: [NotificationsService],
})
export class NotificationsModule {}
