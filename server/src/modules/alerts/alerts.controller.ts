import { Controller, Get, Post, Patch, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
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
    @Body() body: { id?: string; markAllRead?: boolean },
  ) {
    return this.alertsService.markAsRead(user.orgId, body.id, body.markAllRead);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Trigger simulated alert webhook' })
  async triggerTestAlert(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.alertsService.triggerTestAlert(user.orgId, body);
  }
}
