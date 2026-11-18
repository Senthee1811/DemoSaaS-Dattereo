import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { CurrentUser, AuthenticatedUser } from '@/modules/auth/decorators/current-user.decorator';

@ApiTags('Spend Analytics & Telemetry')
@ApiBearerAuth()
@Controller('api/v1/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  @ApiOperation({ summary: 'Get aggregated spend analytics, 7-day velocity, and model breakdowns' })
  async getAnalytics(@CurrentUser() user: AuthenticatedUser, @Query('projectId') projectId?: string) {
    return this.analyticsService.getDashboardAnalytics(user.orgId, projectId);
  }
}
