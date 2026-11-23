import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { assertProjectInOrg } from '@/common/tenant';
import { EncryptionService } from '@/modules/encryption/encryption.service';
import { AlertDispatchService } from './alert-dispatch.service';
import { isValidSlackWebhookUrl } from './slack-blocks';

const THRESHOLD_TYPES = ['PERCENT_80', 'HARD_BLOCK', 'ANOMALY_DETECTED'] as const;

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly dispatcher: AlertDispatchService,
  ) {}

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
        deliveredAt: a.deliveredAt,
        deliveryError: a.deliveryError,
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

  /**
   * Slack delivery state for a project. The webhook URL is a secret and is never
   * returned. `slackConfigured` is true only when a URL is saved AND the most
   * recent Slack delivery succeeded.
   */
  async getConfig(orgId: string, projectId: string) {
    if (!projectId) throw new BadRequestException('projectId is required');
    await assertProjectInOrg(this.prisma, projectId, orgId);
    const cfg = await this.prisma.alertConfig.findUnique({ where: { projectId }, select: { slackWebhookUrl: true } });
    const hasWebhook = Boolean(cfg?.slackWebhookUrl);
    const last = hasWebhook
      ? await this.prisma.budgetAlert.findFirst({
          where: { projectId, channel: 'SLACK' },
          orderBy: { triggeredAt: 'desc' },
          select: { status: true, deliveryError: true },
        })
      : null;
    return {
      projectId,
      slackUrlSaved: hasWebhook,
      slackConfigured: hasWebhook && last?.status === 'SENT',
      lastSlackStatus: last?.status ?? null,
      lastSlackError: last?.status === 'FAILED' ? last.deliveryError : null,
    };
  }

  /** Saves (encrypted) or clears the project's Slack Incoming Webhook URL. */
  async setSlackWebhook(orgId: string, projectId: string, url: string | null) {
    if (!projectId) throw new BadRequestException('projectId is required');
    await assertProjectInOrg(this.prisma, projectId, orgId);
    let encrypted: string | null = null;
    if (typeof url === 'string' && url.trim() !== '') {
      if (!isValidSlackWebhookUrl(url.trim())) {
        throw new BadRequestException('That is not a Slack Incoming Webhook URL (expected https://hooks.slack.com/services/...).');
      }
      encrypted = this.encryption.encryptApiKey(url.trim());
    }
    await this.prisma.alertConfig.upsert({
      where: { projectId },
      update: { slackWebhookUrl: encrypted },
      create: { projectId, slackWebhookUrl: encrypted },
    });
    return this.getConfig(orgId, projectId);
  }

  async triggerTestAlert(
    orgId: string,
    dto: {
      projectId: string;
      thresholdType: 'PERCENT_80' | 'HARD_BLOCK' | 'ANOMALY_DETECTED';
    },
  ) {
    const project = await assertProjectInOrg(this.prisma, dto?.projectId, orgId);

    const thresholdType = THRESHOLD_TYPES.includes(dto.thresholdType) ? dto.thresholdType : 'PERCENT_80';
    const projectName = project.name;
    const budget = Number(project.budgetMonthly);

    let title = `⚠️ Budget Warning (80%): ${projectName}`;
    let message = `Project ${projectName} has used 80% of its monthly budget allocation ($${(budget * 0.8).toFixed(2)} / $${budget.toFixed(2)}).`;

    if (thresholdType === 'HARD_BLOCK') {
      title = `🛑 Hard-Block Activated: ${projectName}`;
      message = `Monthly budget cap of $${budget.toFixed(2)} reached. Future AI requests will fail closed with HTTP 429.`;
    } else if (thresholdType === 'ANOMALY_DETECTED') {
      title = `⚡ Spend Anomaly Spike: ${projectName}`;
      message = `Test alert: this is what a spend-spike notification looks like. No spike was detected; real alerts describe the observed spend.`;
    }

    // Same path as real alerts: IN_APP without a webhook, otherwise QUEUED and
    // delivered (or failed) by the worker. Never marked SENT here.
    const alert = await this.dispatcher.dispatch({
      projectId: project.id,
      thresholdType,
      thresholdValue: budget,
      title: `[TEST] ${title}`,
      message,
    });

    return { alert };
  }
}
