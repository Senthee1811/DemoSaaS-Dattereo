import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { EncryptionService } from '@/modules/encryption/encryption.service';
import { EmailService } from '@/modules/email/email.service';
import { scrubSecrets } from '@/common/scrub-secrets';
import { DELIVER_JOB, DELIVER_JOB_OPTS, NOTIFICATION_QUEUE, NotificationEvent, REQUEUE_STALE_JOB } from './notification.events';
import { ChannelConfig, NotificationsService, slackHosts } from './notifications.service';
import { signWebhook } from './signing';
import { Resolver, UnsafeDestinationError } from './url-safety';
import { OutboundError, PostOptions, safePost } from './safe-http';

const TIMEOUT_MS = 5000;

/** A delivery failure. `permanent` = retrying cannot help (bad destination, revoked webhook, config gone). */
export class DeliveryError extends Error {
  constructor(message: string, readonly permanent: boolean) {
    super(message);
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Sends queued deliveries. The delivery row is the record: status goes QUEUED -> RETRYING -> SENT | FAILED, with the
 * attempt count and a scrubbed reason, so history is visible and nothing is "lost in the queue".
 *
 *  - transient failures (timeouts, 5xx, 429, 408, network) are retried by BullMQ with exponential backoff
 *  - permanent failures (other 4xx, unsafe destination, deleted/disabled channel) fail at once
 *  - redirects are never followed; the destination is re-validated before every attempt
 *  - destination details are decrypted only here, in memory, and never logged or stored in the history
 */
@Processor(NOTIFICATION_QUEUE)
export class NotificationDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationDeliveryProcessor.name);
  /** Test seam only: production uses the system resolver. */
  resolver?: Resolver;
  requestImpl?: PostOptions['requestImpl'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<{ deliveryId: string }>): Promise<unknown> {
    if (job.name === REQUEUE_STALE_JOB) return { requeued: await this.notifications.requeueStale() };
    if (job.name !== DELIVER_JOB) return;
    return this.deliver(job);
  }

  async deliver(job: Pick<Job<{ deliveryId: string }>, 'data' | 'attemptsMade' | 'opts'>): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.findUnique({ where: { id: job.data.deliveryId }, include: { channel: true } });
    if (!delivery || delivery.status === 'SENT') return; // already done (duplicate job) or gone
    const maxAttempts = job.opts?.attempts ?? DELIVER_JOB_OPTS.attempts;
    const attempt = delivery.attempts + 1;
    const fail = async (message: string, status: 'FAILED' | 'RETRYING') =>
      this.prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status, attempts: attempt, lastAttemptAt: new Date(), lastError: message.slice(0, 300) } });

    if (!delivery.channel || !delivery.channel.enabled) {
      await fail('The channel was deleted or disabled before delivery.', 'FAILED');
      throw new UnrecoverableError('channel unavailable');
    }

    try {
      const config = JSON.parse(this.encryption.decryptApiKey(delivery.channel.encryptedConfig)) as ChannelConfig;
      await this.send(delivery.channel.type, config, delivery.payload as unknown as NotificationEvent, delivery.id);
    } catch (err: any) {
      const permanent = err instanceof DeliveryError ? err.permanent : false;
      const message = scrubSecrets(err instanceof DeliveryError ? err.message : 'Unexpected delivery error', []);
      const last = permanent || (job.attemptsMade ?? 0) + 1 >= maxAttempts;
      await fail(message, last ? 'FAILED' : 'RETRYING');
      this.logger.warn(`Delivery ${delivery.id} (${delivery.channelType}) attempt ${attempt} failed: ${message}${last ? ' [final]' : ' [will retry]'}`);
      if (permanent) throw new UnrecoverableError(message);
      throw new Error(message); // BullMQ schedules the next attempt
    }
    await this.prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: 'SENT', attempts: attempt, lastAttemptAt: new Date(), deliveredAt: new Date(), lastError: null } });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<{ deliveryId: string }> | undefined, err: Error): Promise<void> {
    try {
      if (!job?.data?.deliveryId || job.name !== DELIVER_JOB) return;
      const max = job.opts?.attempts ?? DELIVER_JOB_OPTS.attempts;
      if (job.attemptsMade < max && !(err instanceof UnrecoverableError)) return; // will retry
      // Safety net: make sure an exhausted job can never leave the row looking in-flight
      await this.prisma.notificationDelivery.updateMany({ where: { id: job.data.deliveryId, status: { in: ['QUEUED', 'RETRYING'] } }, data: { status: 'FAILED' } });
    } catch (e: any) {
      this.logger.error(`Could not finalise failed delivery: ${e?.message}`);
    }
  }

  // ── Senders ───────────────────────────────────────────────────────────────
  private async send(type: string, config: ChannelConfig, event: NotificationEvent, deliveryId: string): Promise<void> {
    if (type === 'EMAIL') return this.sendEmail(config, event);
    const slack = type === 'SLACK';
    const body = slack ? JSON.stringify(this.slackBody(event)) : JSON.stringify({ id: event.id, type: event.type, createdAt: event.occurredAt, orgId: event.orgId, data: event.data });
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'SpendGuard-Notifications/1' };
    if (!slack) {
      const ts = Math.floor(Date.now() / 1000);
      headers['X-SpendGuard-Event'] = event.type;
      headers['X-SpendGuard-Event-Id'] = event.id;
      headers['X-SpendGuard-Delivery'] = deliveryId;
      headers['X-SpendGuard-Timestamp'] = String(ts);
      headers['X-SpendGuard-Signature'] = signWebhook(config.secret ?? '', ts, body);
    }

    // Validation, DNS resolution and the pinned connection all happen inside safePost, on every attempt
    let res: { status: number };
    try {
      res = await safePost(config.url ?? '', body, { headers, hosts: slack ? slackHosts() : undefined, timeoutMs: TIMEOUT_MS, resolver: this.resolver, requestImpl: this.requestImpl });
    } catch (err: any) {
      if (err instanceof UnsafeDestinationError) throw new DeliveryError(`Destination rejected: ${err.message}`, true);
      if (err instanceof OutboundError) {
        if (err.kind === 'timeout') throw new DeliveryError(`The destination did not respond within ${TIMEOUT_MS / 1000}s`, false);
        if (err.kind === 'tls') throw new DeliveryError('TLS certificate verification failed for the destination', true);
        if (err.kind === 'too_large') throw new DeliveryError('The destination response was too large', true);
      }
      // Never echo err.message: it can contain the destination URL
      throw new DeliveryError('Could not reach the destination', false);
    }
    if (res.status >= 200 && res.status < 300) return;
    if (res.status >= 300 && res.status < 400) throw new DeliveryError(`The destination answered with a redirect (HTTP ${res.status}); redirects are not followed`, true);
    const transient = res.status === 408 || res.status === 429 || res.status >= 500;
    throw new DeliveryError(`The destination answered HTTP ${res.status}`, !transient);
  }

  private slackBody(event: NotificationEvent) {
    const sev = event.data.severity === 'critical' ? '🛑' : event.data.severity === 'warning' ? '⚠️' : 'ℹ️';
    const lines = [`*${sev} ${event.data.title}*`, event.data.message];
    return { text: `${event.data.title}`, blocks: [{ type: 'section', text: { type: 'mrkdwn', text: lines.map((l) => String(l).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('\n') } }] };
  }

  private async sendEmail(config: ChannelConfig, event: NotificationEvent): Promise<void> {
    if (!process.env.RESEND_API_KEY) throw new DeliveryError('Email is not configured on this server (RESEND_API_KEY is not set)', true);
    const subject = `[SpendGuard] ${event.data.title}`.slice(0, 200);
    const text = `${event.data.title}\n\n${event.data.message}\n\n— SpendGuard`;
    const html = `<p><b>${esc(event.data.title)}</b></p><p>${esc(String(event.data.message))}</p><p style="color:#80868B">SpendGuard</p>`;
    const results = await Promise.all((config.recipients ?? []).map((to) => this.email.sendNotification(to, subject, { html, text })));
    if (results.some((ok) => !ok)) throw new DeliveryError('The email provider rejected the message for at least one recipient', false);
  }
}
