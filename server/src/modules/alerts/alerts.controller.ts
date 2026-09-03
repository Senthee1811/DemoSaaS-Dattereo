import { Controller, Get, Post, Patch, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';

@ApiTags('Alerts & Anomalies')
@Controller('api/v1/alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'List budget alerts and anomaly notifications' })
  async getAlerts(@Query('projectId') projectId?: string) {
    return this.alertsService.listAlerts(projectId);
  }

  @Patch()
  @ApiOperation({ summary: 'Mark alert as read or mark all as read' })
  async markRead(@Body() body: { id?: string; markAllRead?: boolean }) {
    return this.alertsService.markAsRead(body.id, body.markAllRead);
  }

  @Post()
  @ApiOperation({ summary: 'Trigger simulated alert webhook' })
  async triggerTestAlert(@Body() body: any) {
    return this.alertsService.triggerTestAlert(body);
  }
}
