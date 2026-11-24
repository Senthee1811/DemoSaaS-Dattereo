import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { EncryptionService } from '@/modules/encryption/encryption.service';
import { ChannelType, CHANNEL_TYPES, DELIVER_JOB, DELIVER_JOB_OPTS, EVENT_TYPES, NOTIFICATION_QUEUE, NotificationEvent } from './notification.events';
import { generateWebhookSecret } from './signing';
import { assertSafeDestination, UnsafeDestinationError } from './url-safety';

const MAX_CHANNELS_PER_ORG = 20;
const MAX_RECIPIENTS = 10;
const EMAIL_RE = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,255}\.[^\s@<>"]{2,}$/;

export function slackHosts(): string[] {
  return ['hooks.slack.com', ...(process.env.NOTIFICATION_SLACK_HOSTS ? process.env.NOTIFICATION_SLACK_HOSTS.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean) : [])];
}

export interface ChannelConfig {
  /** SLACK: incoming-webhook URL. WEBHOOK: destination URL. */
  url?: string;
  /** WEBHOOK: signing secret (shown to the admin once). */
  secret?: string;
  /** WEBHOOK: the secret before the last rotation; also signs deliveries until previousSecretExpiresAt. */
  previousSecret?: string;
  previousSecretExpiresAt?: string;
  /** EMAIL */
  recipients?: string[];
}

const safeJson = (v: string | null) => {
  try {
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
};
const DEFAULT_GRACE_HOURS = 24;
const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, '$1***$2');

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Administrative audit trail for channel changes. Records WHO did WHAT to WHICH channel, never the destination,
   * secret or recipients. Best-effort for the caller (a failed audit write is logged loudly, not swallowed silently).
   */
  private async audit(orgId: string, actor: string | undefined, action: string, channelId: string, extra: Record<string, unknown> = {}) {
    try {
      await this.prisma.auditLog.create({ data: { orgId, actor: actor ?? 'system', action: `notification.channel.${action}`, metadata: JSON.stringify({ channelId, ...extra }) } });
    } catch (err: any) {
      this.logger.error(`AUDIT WRITE FAILED for ${action} on channel ${channelId}: ${err?.message}`);
    }
  }

  async channelAudit(orgId: string, limit = 100) {
    const rows = await this.prisma.auditLog.findMany({ where: { orgId, action: { startsWith: 'notification.channel.' } }, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 200) });
    return { events: rows.map((r) => ({ id: r.id, action: r.action.replace('notification.channel.', ''), actor: r.actor, at: r.createdAt, details: safeJson(r.metadata) })) };
  }

  // ── Publishing ────────────────────────────────────────────────────────────
  /**
   * Publishes one event to every destination of the organization that wants it, plus the built-in in-app inbox.
   * Idempotent per (destination, event id). A delivery row is written BEFORE anything is queued, so a failed or
   * lost queue job leaves a QUEUED row the stale-delivery sweep recovers. Never throws into the caller.
   */
  async publish(event: NotificationEvent, only?: { channelId: string }): Promise<{ deliveries: number }> {
    let created = 0;
    try {
      if (!EVENT_TYPES.includes(event.type)) throw new Error(`Unknown event type ${event.type}`);
      if (!only) created += await this.inApp(event);
      const channels = await this.prisma.notificationChannel.findMany({
        where: {
          orgId: event.orgId,
          enabled: true,
          ...(only ? { id: only.channelId } : {}),
          OR: [{ eventTypes: { isEmpty: true } }, { eventTypes: { has: event.type } }],
        },
        select: { id: true, type: true },
      });
      for (const ch of channels) {
        let delivery;
        try {
          delivery = await this.prisma.notificationDelivery.create({
            data: { orgId: event.orgId, channelId: ch.id, channelType: ch.type, eventId: event.id, eventType: event.type, status: 'QUEUED', payload: this.payload(event) },
          });
        } catch (err: any) {
          if (err?.code === 'P2002') continue; // this event was already published to this destination
          throw err;
        }
        created++;
        await this.enqueue(delivery.id).catch((err) => this.logger.warn(`Queued row ${delivery.id} will be recovered by the sweep (${err?.message})`));
      }
    } catch (err: any) {
      this.logger.error(`Could not publish event ${event?.id}: ${err?.message}`);
    }
    return { deliveries: created };
  }

  private payload(event: NotificationEvent): Prisma.InputJsonValue {
    return { id: event.id, type: event.type, orgId: event.orgId, occurredAt: event.occurredAt, data: event.data } as Prisma.InputJsonValue;
  }

  private async inApp(event: NotificationEvent): Promise<number> {
    const exists = await this.prisma.notificationDelivery.findFirst({ where: { orgId: event.orgId, channelId: null, eventId: event.id }, select: { id: true } });
    if (exists) return 0;
    await this.prisma.notificationDelivery.create({
      data: { orgId: event.orgId, channelId: null, channelType: 'IN_APP', eventId: event.id, eventType: event.type, status: 'SENT', attempts: 1, deliveredAt: new Date(), payload: this.payload(event) },
    });
    return 1;
  }

  async enqueue(deliveryId: string, attemptTag = ''): Promise<void> {
    await this.queue.add(DELIVER_JOB, { deliveryId }, { ...DELIVER_JOB_OPTS, jobId: `deliver-${deliveryId}${attemptTag}` });
  }

  /** Re-queues deliveries whose queue job was lost (publish failed, Redis restarted): the database row is the record. */
  async requeueStale(olderThanMs = 2 * 60_000, limit = 200): Promise<number> {
    const rows = await this.prisma.notificationDelivery.findMany({
      where: { status: { in: ['QUEUED', 'RETRYING'] }, channelId: { not: null }, createdAt: { lt: new Date(Date.now() - olderThanMs) }, OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: new Date(Date.now() - olderThanMs) } }] },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    const bucket = Math.floor(Date.now() / 3_600_000);
    let n = 0;
    for (const r of rows) {
      try {
        await this.enqueue(r.id, `-r${bucket}`);
        n++;
      } catch {
        /* next sweep */
      }
    }
    return n;
  }

  // ── Channels (organization level; destination details are encrypted at rest) ──
  async createChannel(orgId: string, userId: string, body: { type?: string; name?: string; eventTypes?: string[]; config?: Record<string, unknown> }) {
    const type = String(body.type ?? '').toUpperCase() as ChannelType;
    if (!CHANNEL_TYPES.includes(type)) throw new BadRequestException(`type must be one of ${CHANNEL_TYPES.join(', ')}`);
    const name = String(body.name ?? '').trim();
    if (!name || name.length > 100) throw new BadRequestException('name is required (max 100 characters)');
    const eventTypes = this.validateEventTypes(body.eventTypes);
    if ((await this.prisma.notificationChannel.count({ where: { orgId } })) >= MAX_CHANNELS_PER_ORG) throw new BadRequestException(`An organization can have at most ${MAX_CHANNELS_PER_ORG} channels.`);

    const { config, hint, revealSecret } = await this.validateConfig(type, body.config ?? {});
    const row = await this.prisma.notificationChannel.create({
      data: { orgId, type, name, eventTypes, encryptedConfig: this.encryption.encryptApiKey(JSON.stringify(config)), configHint: hint, createdById: userId },
    });
    await this.audit(orgId, userId, 'created', row.id, { type, name, eventTypes });
    return { ...this.publicChannel(row), ...(revealSecret ? { signingSecret: revealSecret, signingSecretNote: 'Shown once. Store it now; it cannot be retrieved again (you can rotate it).' } : {}) };
  }

  /** Validates and normalises a destination. Throws a user-safe BadRequest on anything unsafe. */
  private async validateConfig(type: ChannelType, raw: Record<string, unknown>): Promise<{ config: ChannelConfig; hint: string; revealSecret?: string }> {
    try {
      if (type === 'SLACK') {
        const url = await assertSafeDestination(String(raw.url ?? raw.webhookUrl ?? ''), { hosts: slackHosts() });
        return { config: { url: url.toString() }, hint: `${url.hostname}/…` };
      }
      if (type === 'WEBHOOK') {
        const url = await assertSafeDestination(String(raw.url ?? ''));
        const secret = generateWebhookSecret();
        return { config: { url: url.toString(), secret }, hint: `${url.hostname}${url.pathname.length > 1 ? '/…' : ''}`, revealSecret: secret };
      }
      const recipients = Array.isArray(raw.recipients) ? [...new Set((raw.recipients as unknown[]).map((r) => String(r).trim().toLowerCase()))] : [];
      if (!recipients.length || recipients.length > MAX_RECIPIENTS || recipients.some((r) => !EMAIL_RE.test(r))) throw new BadRequestException(`recipients must be 1–${MAX_RECIPIENTS} valid email addresses`);
      return { config: { recipients }, hint: recipients.map(maskEmail).join(', ') };
    } catch (err) {
      if (err instanceof UnsafeDestinationError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  private validateEventTypes(v: unknown): string[] {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || v.some((e) => !EVENT_TYPES.includes(e as any))) throw new BadRequestException(`eventTypes must be a list of: ${EVENT_TYPES.join(', ')}`);
    return [...new Set(v as string[])];
  }

  private publicChannel(c: { id: string; type: string; name: string; configHint: string | null; eventTypes: string[]; enabled: boolean; createdAt: Date; updatedAt: Date }) {
    // Never includes encryptedConfig, URLs, secrets or recipients: only a non-sensitive hint
    return { id: c.id, type: c.type, name: c.name, destination: c.configHint, eventTypes: c.eventTypes, enabled: c.enabled, createdAt: c.createdAt, updatedAt: c.updatedAt };
  }

  private async channelOr404(orgId: string, id: string) {
    const c = await this.prisma.notificationChannel.findFirst({ where: { id, orgId } }); // org-scoped: another tenant's id is a 404
    if (!c) throw new NotFoundException('Channel not found');
    return c;
  }

  async listChannels(orgId: string) {
    const rows = await this.prisma.notificationChannel.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } });
    const last = await this.prisma.notificationDelivery.groupBy({ by: ['channelId', 'status'], where: { orgId, channelId: { in: rows.map((r) => r.id) } }, _count: { id: true }, _max: { createdAt: true } });
    return {
      channels: rows.map((r) => {
        const mine = last.filter((l) => l.channelId === r.id);
        const count = (s: string) => mine.find((m) => m.status === s)?._count.id ?? 0;
        return { ...this.publicChannel(r), stats: { sent: count('SENT'), failed: count('FAILED'), pending: count('QUEUED') + count('RETRYING') } };
      }),
      eventTypes: EVENT_TYPES,
      channelTypes: CHANNEL_TYPES,
    };
  }

  async updateChannel(orgId: string, id: string, body: { name?: string; enabled?: boolean; eventTypes?: string[] }, actor?: string) {
    const wasEnabled = (await this.channelOr404(orgId, id)).enabled;
    const data: Prisma.NotificationChannelUpdateInput = {};
    if (body.name !== undefined) {
      const n = String(body.name).trim();
      if (!n || n.length > 100) throw new BadRequestException('name must be 1–100 characters');
      data.name = n;
    }
    if (body.enabled !== undefined) data.enabled = !!body.enabled;
    if (body.eventTypes !== undefined) data.eventTypes = this.validateEventTypes(body.eventTypes);
    const row = await this.prisma.notificationChannel.update({ where: { id }, data });
    if (body.enabled !== undefined && !!body.enabled !== wasEnabled) await this.audit(orgId, actor, body.enabled ? 'resumed' : 'paused', id);
    if (data.name !== undefined || data.eventTypes !== undefined) await this.audit(orgId, actor, 'updated', id, { name: data.name !== undefined, eventTypes: data.eventTypes !== undefined });
    return this.publicChannel(row);
  }

  async deleteChannel(orgId: string, id: string, actor?: string) {
    const c = await this.channelOr404(orgId, id);
    await this.prisma.notificationChannel.delete({ where: { id } }); // delivery history is kept (channel_id -> NULL)
    await this.audit(orgId, actor, 'removed', id, { type: c.type, name: c.name });
    return { deleted: true };
  }

  /**
   * Rotation policy: the new secret signs every delivery from now on. Unless `immediate` is set, the previous secret
   * keeps signing too (a second `v1=` entry in the signature header) for a grace window (default 24 h, max 7 days), so a
   * receiver that has not deployed the new secret yet, and deliveries already retrying, keep verifying. `immediate`
   * revokes the old secret at once (use it when the old secret is believed to be compromised).
   */
  async rotateSecret(orgId: string, id: string, opts: { immediate?: boolean; graceHours?: number } = {}, actor?: string) {
    const c = await this.channelOr404(orgId, id);
    if (c.type !== 'WEBHOOK') throw new BadRequestException('Only webhook channels have a signing secret.');
    const config = JSON.parse(this.encryption.decryptApiKey(c.encryptedConfig)) as ChannelConfig;
    const secret = generateWebhookSecret();
    const requested = Number(opts.graceHours ?? DEFAULT_GRACE_HOURS);
    const hours = Math.min(Math.max(Number.isFinite(requested) ? requested : DEFAULT_GRACE_HOURS, 0), 168);
    const keepOld = !opts.immediate && hours > 0 && Boolean(config.secret);
    const next: ChannelConfig = { ...config, secret, previousSecret: keepOld ? config.secret : undefined, previousSecretExpiresAt: keepOld ? new Date(Date.now() + hours * 3_600_000).toISOString() : undefined };
    await this.prisma.notificationChannel.update({ where: { id }, data: { encryptedConfig: this.encryption.encryptApiKey(JSON.stringify(next)) } });
    await this.audit(orgId, actor, 'secret_rotated', id, { immediate: !keepOld, graceHours: keepOld ? hours : 0 });
    return {
      signingSecret: secret,
      previousSecretValidUntil: next.previousSecretExpiresAt ?? null,
      signingSecretNote: keepOld ? `Shown once. The previous secret keeps verifying until ${next.previousSecretExpiresAt}.` : 'Shown once. The previous secret no longer verifies.',
    };
  }

  /** Sends a clearly labelled test event to this one destination only. */
  async sendTest(orgId: string, id: string, actor?: string) {
    await this.channelOr404(orgId, id);
    await this.audit(orgId, actor, 'tested', id);
    const event: NotificationEvent = {
      id: `test:${randomUUID()}`, type: 'notification.test', orgId, occurredAt: new Date().toISOString(),
      data: { title: 'SpendGuard test notification', message: 'If you can read this, this destination is wired up correctly.', severity: 'info', test: true },
    };
    const res = await this.publish(event, { channelId: id });
    return { queued: res.deliveries > 0, eventId: event.id };
  }

  // ── History and inbox ─────────────────────────────────────────────────────
  async deliveries(orgId: string, q: { channelId?: string; status?: string; limit?: number; offset?: number }) {
    const where: Prisma.NotificationDeliveryWhereInput = { orgId, ...(q.channelId ? { channelId: q.channelId } : {}), ...(q.status ? { status: q.status.toUpperCase() } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.notificationDelivery.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(q.limit ?? 50, 200), skip: q.offset ?? 0, include: { channel: { select: { name: true } } } }),
      this.prisma.notificationDelivery.count({ where }),
    ]);
    return {
      total,
      deliveries: rows.map((d) => ({
        id: d.id, channelId: d.channelId, channelName: d.channel?.name ?? (d.channelType === 'IN_APP' ? 'In-app' : '(deleted channel)'), channelType: d.channelType,
        eventId: d.eventId, eventType: d.eventType, title: (d.payload as any)?.data?.title ?? null, status: d.status, attempts: d.attempts,
        lastError: d.lastError, lastAttemptAt: d.lastAttemptAt, deliveredAt: d.deliveredAt, createdAt: d.createdAt,
      })),
    };
  }

  async retryDelivery(orgId: string, id: string) {
    const d = await this.prisma.notificationDelivery.findFirst({ where: { id, orgId } });
    if (!d || !d.channelId) throw new NotFoundException('Delivery not found');
    if (d.status !== 'FAILED') throw new BadRequestException('Only failed deliveries can be retried.');
    await this.prisma.notificationDelivery.update({ where: { id }, data: { status: 'QUEUED', attempts: 0, lastError: null } });
    await this.enqueue(id, `-manual${Date.now()}`);
    return { requeued: true };
  }

  async inbox(orgId: string, unreadOnly = false) {
    const where: Prisma.NotificationDeliveryWhereInput = { orgId, channelId: null, ...(unreadOnly ? { readAt: null } : {}) };
    const [rows, unread] = await Promise.all([
      this.prisma.notificationDelivery.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.notificationDelivery.count({ where: { orgId, channelId: null, readAt: null } }),
    ]);
    return { unread, items: rows.map((r) => ({ id: r.id, eventType: r.eventType, createdAt: r.createdAt, readAt: r.readAt, ...((r.payload as any)?.data ?? {}) })) };
  }

  async markRead(orgId: string, ids?: string[]) {
    const res = await this.prisma.notificationDelivery.updateMany({ where: { orgId, channelId: null, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
    return { updated: res.count };
  }
}
