import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { BudgetService } from './budget.service';
import { BudgetReconciliationProcessor } from './budget-reconciliation.processor';

@Global()
@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: 'budget-reconciliation',
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
  providers: [BudgetService, BudgetReconciliationProcessor],
  exports: [BudgetService],
})
export class BudgetModule {}
