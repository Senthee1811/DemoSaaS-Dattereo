import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { EmailModule } from './modules/email/email.module';
import { AuthModule } from './modules/auth/auth.module';
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
import { BillingModule } from './modules/billing/billing.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './modules/metrics/metrics.service';
import { InsightsModule } from './modules/insights/insights.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    RedisModule,
    EmailModule,
    AuthModule,
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
    BillingModule,
    NotificationsModule,
    InsightsModule,
    MetricsModule,
    HealthModule,
  ],
  providers: [
    // Order matters: authenticate first, then enforce @Roles().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

