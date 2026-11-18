import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { assertProjectInOrg } from '@/common/tenant';

const THRESHOLD_TYPES = ['PERCENT_80', 'HARD_BLOCK', 'ANOMALY_DETECTED'] as const;
const CHANNELS = ['SLACK', 'EMAIL', 'IN_APP'] as const;

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listAlerts(orgId: string, projectId?: string) {
    const where: any = { project: { orgId } };
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

  async markAsRead(orgId: string, id?: string, markAllRead = false) {
    if (markAllRead) {
      await this.prisma.budgetAlert.updateMany({
        where: { isRead: false, project: { orgId } },
        data: { isRead: true },
      });
    } else if (id) {
      const result = await this.prisma.budgetAlert.updateMany({
        where: { id, project: { orgId } },
        data: { isRead: true },
      });
      if (result.count === 0) throw new NotFoundException('Alert not found');
    } else {
      throw new BadRequestException('Provide an alert id or markAllRead: true');
    }
    return { success: true };
  }

  async triggerTestAlert(
    orgId: string,
    dto: {
      projectId: string;
      thresholdType: 'PERCENT_80' | 'HARD_BLOCK' | 'ANOMALY_DETECTED';
      channel?: 'SLACK' | 'EMAIL' | 'IN_APP';
    },
  ) {
    const project = await assertProjectInOrg(this.prisma, dto?.projectId, orgId);

    const thresholdType = THRESHOLD_TYPES.includes(dto.thresholdType) ? dto.thresholdType : 'PERCENT_80';
    const channel = dto.channel && CHANNELS.includes(dto.channel) ? dto.channel : 'IN_APP';
    const projectName = project.name;
    const budget = Number(project.budgetMonthly);

    let title = `⚠️ Budget Warning (80%): ${projectName}`;
    let message = `Project ${projectName} has used 80% of its monthly budget allocation ($${(budget * 0.8).toFixed(2)} / $${budget.toFixed(2)}).`;

    if (thresholdType === 'HARD_BLOCK') {
      title = `🛑 Hard-Block Activated: ${projectName}`;
      message = `Monthly budget cap of $${budget.toFixed(2)} reached. Future AI requests will fail closed with HTTP 429.`;
    } else if (thresholdType === 'ANOMALY_DETECTED') {
      title = `⚡ Spend Anomaly Spike: ${projectName}`;
      message = `Statistical usage surge detected: 3.4x above 7-day rolling average spend.`;
    }

    const alert = await this.prisma.budgetAlert.create({
      data: {
        projectId: project.id,
        thresholdType,
        thresholdValue: budget,
        channel,
        title: `[TEST] ${title}`,
        message,
        isRead: false,
        status: 'SENT',
      },
    });

    return { alert };
  }
}
