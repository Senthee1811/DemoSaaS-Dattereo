import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { EncryptionModule } from './modules/encryption/encryption.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { AnomalyModule } from './modules/anomaly/anomaly.module';
import { BudgetModule } from './modules/budget/budget.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { KeysModule } from './modules/keys/keys.module';
import { AuditModule } from './modules/audit/audit.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { TeamModule } from './modules/team/team.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    EncryptionModule,
    PricingModule,
    AnomalyModule,
    BudgetModule,
    GatewayModule,
    OrganizationsModule,
    KeysModule,
    AuditModule,
    AlertsModule,
    AnalyticsModule,
    TeamModule,
    HealthModule,
  ],
})
export class AppModule {}
