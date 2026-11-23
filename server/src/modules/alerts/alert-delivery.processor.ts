import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { EncryptionService } from '@/modules/encryption/encryption.service';
import { ALERT_DELIVERY_QUEUE, DELIVER_ALERT_JOB_OPTS, AlertDeliveryJob } from './alert-delivery.queue';

const TIMEOUT_MS = 5000;

/**
 * Posts queued alerts to Slack. The only code that may set SENT or FAILED:
 * SENT after a 2xx from Slack, FAILED once retries are exhausted.
 */
@Processor(ALERT_DELIVERY_QUEUE)
export class AlertDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(AlertDeliveryProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {
    super();
  }

  async process(job: Job<AlertDeliveryJob>): Promise<void> {
    const { alertId, projectId, blocks } = job.data;
    try {
      await this.post(projectId, blocks);
    } catch (err: any) {
      const message = String(err?.message ?? 'Delivery failed').slice(0, 300);
      const maxAttempts = job.opts?.attempts ?? DELIVER_ALERT_JOB_OPTS.attempts;
      if (job.attemptsMade + 1 >= maxAttempts) {
        await this.prisma.budgetAlert.update({
          where: { id: alertId },
          data: { status: 'FAILED', deliveryError: message },
        });
        this.logger.warn(`Alert ${alertId} delivery failed after ${job.attemptsMade + 1} attempts: ${message}`);
      } else {
        this.logger.warn(`Alert ${alertId} delivery attempt ${job.attemptsMade + 1} failed: ${message}`);
      }
      throw err; // BullMQ schedules the next attempt
    }
    await this.prisma.budgetAlert.update({
      where: { id: alertId },
      data: { status: 'SENT', deliveredAt: new Date(), deliveryError: null },
    });
  }

  private async post(projectId: string, blocks: unknown[]): Promise<void> {
    const cfg = await this.prisma.alertConfig.findUnique({ where: { projectId }, select: { slackWebhookUrl: true } });
    if (!cfg?.slackWebhookUrl) throw new Error('Slack webhook is no longer configured for this project');
    const url = this.encryption.decryptApiKey(cfg.slackWebhookUrl);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err: any) {
      // Do not echo err.message: it can contain the webhook URL.
      throw new Error(err?.name === 'TimeoutError' ? 'Slack did not respond within 5s' : 'Could not reach Slack');
    }
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 80);
      throw new Error(`Slack responded ${res.status}${body ? `: ${body}` : ''}`);
    }
  }
}
