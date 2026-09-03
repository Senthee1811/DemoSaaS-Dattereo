import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';

@ApiTags('Spend Analytics & Telemetry')
@Controller('api/v1/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  @ApiOperation({ summary: 'Get aggregated spend analytics, 7-day velocity, and model breakdowns' })
  async getAnalytics(@Query('projectId') projectId?: string) {
    return this.analyticsService.getDashboardAnalytics(projectId);
  }
}
