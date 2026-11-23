import { Controller, Get, Post, Patch, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { MarkAlertsReadDto, SlackConfigDto, TestAlertDto } from './alerts.dto';
import { CurrentUser, AuthenticatedUser } from '@/modules/auth/decorators/current-user.decorator';
import { Roles } from '@/modules/auth/decorators/roles.decorator';

@ApiTags('Alerts & Anomalies')
@ApiBearerAuth()
@Controller('api/v1/alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'List budget alerts and anomaly notifications' })
  async getAlerts(@CurrentUser() user: AuthenticatedUser, @Query('projectId') projectId?: string) {
    return this.alertsService.listAlerts(user.orgId, projectId);
  }

  @Patch()
  @ApiOperation({ summary: 'Mark alert as read or mark all as read' })
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: MarkAlertsReadDto,
  ) {
    return this.alertsService.markAsRead(user.orgId, body.id, body.markAllRead);
  }

  @Get('config')
  @ApiOperation({ summary: 'Slack delivery status for a project (never returns the webhook URL)' })
  async getConfig(@CurrentUser() user: AuthenticatedUser, @Query('projectId') projectId: string) {
    return this.alertsService.getConfig(user.orgId, projectId);
  }

  @Patch('config')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Save or clear the project Slack Incoming Webhook URL (stored encrypted)' })
  async setConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SlackConfigDto,
  ) {
    return this.alertsService.setSlackWebhook(user.orgId, body?.projectId, body?.slackWebhookUrl ?? null);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Send a test alert through the real delivery path' })
  async triggerTestAlert(@CurrentUser() user: AuthenticatedUser, @Body() body: TestAlertDto) {
    return this.alertsService.triggerTestAlert(user.orgId, { projectId: body.projectId, thresholdType: body.thresholdType ?? 'PERCENT_80' });
  }
}
