import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { buildAlertBlocks } from './slack-blocks';
import { ALERT_DELIVERY_QUEUE, DELIVER_ALERT_JOB, DELIVER_ALERT_JOB_OPTS, AlertDeliveryJob } from './alert-delivery.queue';

export interface DispatchAlertParams {
  projectId: string;
  thresholdType: 'PERCENT_80' | 'HARD_BLOCK' | 'ANOMALY_DETECTED';
  thresholdValue: number;
  title: string;
  message: string;
}

/**
 * Records an alert and, when the project has a Slack webhook, queues delivery.
 *
 * Status rules: IN_APP when there is no webhook; QUEUED when delivery is queued.
 * This service never writes SENT. Only the alert-delivery worker does, after
 * Slack actually answered with a 2xx.
 */
@Injectable()
export class AlertDispatchService {
  private readonly logger = new Logger(AlertDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(ALERT_DELIVERY_QUEUE) private readonly queue: Queue,
  ) {}

  async dispatch(params: DispatchAlertParams) {
    const project = await this.prisma.project.findUnique({
      where: { id: params.projectId },
      select: { name: true, alertConfig: { select: { slackWebhookUrl: true, notifyOnAnomaly: true } } },
    });
    const cfg = project?.alertConfig;
    const wantsSlack =
      Boolean(cfg?.slackWebhookUrl) && (params.thresholdType !== 'ANOMALY_DETECTED' || cfg?.notifyOnAnomaly !== false);

    const alert = await this.prisma.budgetAlert.create({
      data: {
        projectId: params.projectId,
        thresholdType: params.thresholdType,
        thresholdValue: params.thresholdValue,
        title: params.title,
        message: params.message,
        isRead: false,
        channel: wantsSlack ? 'SLACK' : 'IN_APP',
        status: wantsSlack ? 'QUEUED' : 'IN_APP',
      },
    });

    if (!wantsSlack) return alert;

    const job: AlertDeliveryJob = {
      alertId: alert.id,
      projectId: params.projectId,
      blocks: buildAlertBlocks({
        title: params.title,
        message: params.message,
        projectName: project?.name ?? params.projectId,
        thresholdType: params.thresholdType,
        triggeredAt: alert.triggeredAt,
      }),
    };

    try {
      await this.queue.add(DELIVER_ALERT_JOB, job, { ...DELIVER_ALERT_JOB_OPTS, jobId: alert.id });
      return alert;
    } catch (err: any) {
      // Never leave a row stuck at QUEUED when nothing is queued.
      this.logger.error(`Could not queue Slack delivery for alert ${alert.id}: ${err?.message}`);
      return this.prisma.budgetAlert.update({
        where: { id: alert.id },
        data: { status: 'FAILED', deliveryError: 'Could not queue delivery (queue unavailable)' },
      });
    }
  }
}
