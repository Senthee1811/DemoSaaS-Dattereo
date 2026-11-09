import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

/**
 * Billing module — fully isolated from the cost-engine module.
 * Only shares the Organization table (via orgId FK) per build doc Principle 3.
 */
@Module({
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
