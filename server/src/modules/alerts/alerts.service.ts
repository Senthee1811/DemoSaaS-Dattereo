import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listAlerts(projectId?: string) {
    const where: any = {};
    if (projectId) where.projectId = projectId;

    const alerts = await this.prisma.budgetAlert.findMany({
      where,
      orderBy: { triggeredAt: 'desc' },
      take: 100,
      include: { project: { select: { name: true } } },
    });

    return {
      alerts: alerts.map((a) => ({
        id: a.id,
        projectId: a.projectId,
        projectName: a.project?.name,
        thresholdType: a.thresholdType,
        thresholdValue: Number(a.thresholdValue),
        channel: a.channel,
        title: a.title,
        message: a.message,
        isRead: a.isRead,
        status: a.status,
        triggeredAt: a.triggeredAt,
      })),
    };
  }

  async markAsRead(id?: string, markAllRead = false) {
    if (markAllRead) {
      await this.prisma.budgetAlert.updateMany({
        where: { isRead: false },
        data: { isRead: true },
      });
    } else if (id) {
      await this.prisma.budgetAlert.update({
        where: { id },
        data: { isRead: true },
      });
    }
    return { success: true };
  }

  async triggerTestAlert(dto: {
    projectId: string;
    thresholdType: 'PERCENT_80' | 'HARD_BLOCK' | 'ANOMALY_DETECTED';
    channel?: 'SLACK' | 'EMAIL' | 'IN_APP';
    slackWebhookUrl?: string;
    emailRecipients?: string[];
  }) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });

    const projectName = project?.name || dto.projectId;
    const budget = project ? Number(project.budgetMonthly) : 1000;

    let title = `⚠️ Budget Warning (80%): ${projectName}`;
    let message = `Project ${projectName} has used 80% of its monthly budget allocation ($${(budget * 0.8).toFixed(2)} / $${budget.toFixed(2)}).`;

    if (dto.thresholdType === 'HARD_BLOCK') {
      title = `🛑 Hard-Block Activated: ${projectName}`;
      message = `Monthly budget cap of $${budget.toFixed(2)} reached. Future AI requests will fail closed with HTTP 429.`;
    } else if (dto.thresholdType === 'ANOMALY_DETECTED') {
      title = `⚡ Spend Anomaly Spike: ${projectName}`;
      message = `Statistical usage surge detected: 3.4x above 7-day rolling average spend.`;
    }

    const alert = await this.prisma.budgetAlert.create({
      data: {
        projectId: dto.projectId,
        thresholdType: dto.thresholdType,
        thresholdValue: budget,
        channel: dto.channel || 'SLACK',
        title,
        message,
        isRead: false,
        status: 'SENT',
      },
    });

    return { alert };
  }
}
