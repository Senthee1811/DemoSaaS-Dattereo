import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { NotificationDeliveryProcessor } from '../src/modules/notifications/notification-delivery.processor';
import { signWebhook, signWebhookHeader, verifyWebhook } from '../src/modules/notifications/signing';
import { DELIVER_JOB_OPTS, NotificationEvent } from '../src/modules/notifications/notification.events';
import { FakeNotificationDb, fakeEncryption } from './helpers/notification-fakes';
import { fakeTransport } from './helpers/fake-transport';

const PUBLIC_URL = 'https://93.184.216.34/hooks/spendguard';
const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
  jest.restoreAllMocks();
});

const event = (): NotificationEvent => ({
  id: `evt-${Math.random().toString(36).slice(2)}`, type: 'budget.alert', orgId: 'org-a', occurredAt: '2026-11-25T10:00:00.000Z',
  data: { title: 'Budget warning', message: 'msg', severity: 'warning' },
});

function setup() {
  const db = new FakeNotificationDb();
  const enc = fakeEncryption();
  const queue: any = { add: jest.fn(async () => ({})) };
  const service = new NotificationsService(db as any, enc as any, queue);
  const processor = new NotificationDeliveryProcessor(db as any, enc as any, { sendNotification: jest.fn(async () => true) } as any, service);
  return { db, enc, service, processor };
}
const job = (deliveryId: string, attemptsMade = 0): any => ({ data: { deliveryId }, attemptsMade, opts: { attempts: DELIVER_JOB_OPTS.attempts }, name: 'deliver' });

describe('webhook signature scheme', () => {
  const secret = 'whsec_current';
  const body = '{"id":"e1","data":{"title":"Budget – 日本語"}}';
  const ts = 1_790_000_000;
  const sig = signWebhook(secret, ts, body);

  it('accepts the correct signature over the exact bytes (string or Buffer)', () => {
    expect(verifyWebhook(secret, sig, String(ts), body, ts + 10)).toBe(true);
    expect(verifyWebhook(secret, sig, String(ts), Buffer.from(body, 'utf8'), ts + 10)).toBe(true);
  });
  it.each([
    ['modified body', () => verifyWebhook(secret, sig, String(ts), body.replace('e1', 'e2'), ts)],
    ['modified timestamp (signature was for another time)', () => verifyWebhook(secret, sig, String(ts + 1), body, ts + 1)],
    ['expired timestamp', () => verifyWebhook(secret, sig, String(ts), body, ts + 301)],
    ['replay window: far future', () => verifyWebhook(secret, sig, String(ts), body, ts - 301)],
    ['missing version prefix', () => verifyWebhook(secret, sig.replace('v1=', ''), String(ts), body, ts)],
    ['unknown version', () => verifyWebhook(secret, sig.replace('v1=', 'v2='), String(ts), body, ts)],
    ['non-hex signature', () => verifyWebhook(secret, `v1=${'z'.repeat(64)}`, String(ts), body, ts)],
    ['short signature', () => verifyWebhook(secret, sig.slice(0, -4), String(ts), body, ts)],
    ['empty header', () => verifyWebhook(secret, '', String(ts), body, ts)],
    ['float/negative/huge timestamps', () => verifyWebhook(secret, sig, '1.79e9', body, ts) || verifyWebhook(secret, sig, '-5', body, ts) || verifyWebhook(secret, sig, '9'.repeat(30), body, ts)],
    ['wrong secret', () => verifyWebhook('whsec_other', sig, String(ts), body, ts)],
  ])('rejects %s', (_n, check) => expect(check()).toBe(false));

  it('rotation: during the grace window the header carries both signatures and either secret verifies', () => {
    const header = signWebhookHeader(['whsec_new', 'whsec_old'], ts, body);
    expect(header.split(',')).toHaveLength(2);
    expect(verifyWebhook('whsec_new', header, String(ts), body, ts)).toBe(true);
    expect(verifyWebhook('whsec_old', header, String(ts), body, ts)).toBe(true); // receiver not yet updated
    expect(verifyWebhook('whsec_unrelated', header, String(ts), body, ts)).toBe(false);
    expect(verifyWebhook(['whsec_x', 'whsec_new'], header, String(ts), body, ts)).toBe(true);
  });
});

describe('secret rotation policy (end to end through delivery)', () => {
  async function webhook() {
    const s = setup();
    const ch: any = await s.service.createChannel('org-a', 'u1', { type: 'WEBHOOK', name: 'w', config: { url: PUBLIC_URL } });
    return { ...s, ch, secret0: ch.signingSecret as string };
  }
  async function deliverOnce(s: Awaited<ReturnType<typeof webhook>>) {
    const t = fakeTransport(200);
    s.processor.requestImpl = t.impl;
    await s.service.publish(event());
    const d = s.db.deliveries.filter((x) => x.channelId === s.ch.id).at(-1)!;
    await s.processor.deliver(job(d.id));
    const { headers } = t.calls[0].options;
    return { header: headers['X-SpendGuard-Signature'] as string, ts: headers['X-SpendGuard-Timestamp'] as string, body: t.calls[0].body };
  }

  it('default rotation: new secret signs, previous secret keeps verifying for the grace window, and the response says until when', async () => {
    const s = await webhook();
    const rot: any = await s.service.rotateSecret('org-a', s.ch.id, {}, 'u1');
    expect(rot.signingSecret).not.toBe(s.secret0);
    expect(Date.parse(rot.previousSecretValidUntil)).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    const sent = await deliverOnce(s);
    expect(verifyWebhook(rot.signingSecret, sent.header, sent.ts, sent.body)).toBe(true);
    expect(verifyWebhook(s.secret0, sent.header, sent.ts, sent.body)).toBe(true);
  });

  it('immediate rotation revokes the old secret at once', async () => {
    const s = await webhook();
    const rot: any = await s.service.rotateSecret('org-a', s.ch.id, { immediate: true }, 'u1');
    const sent = await deliverOnce(s);
    expect(verifyWebhook(rot.signingSecret, sent.header, sent.ts, sent.body)).toBe(true);
    expect(verifyWebhook(s.secret0, sent.header, sent.ts, sent.body)).toBe(false);
    expect(sent.header.split(',')).toHaveLength(1);
  });

  it('after the grace window expires only the new secret signs', async () => {
    const s = await webhook();
    const rot: any = await s.service.rotateSecret('org-a', s.ch.id, { graceHours: 1 }, 'u1');
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 3_600_000);
    const sent = await deliverOnce(s);
    expect(verifyWebhook(s.secret0, sent.header, sent.ts, sent.body, Math.floor(Date.now() / 1000))).toBe(false);
    expect(verifyWebhook(rot.signingSecret, sent.header, sent.ts, sent.body, Math.floor(Date.now() / 1000))).toBe(true);
  });

  it('a retry of a delivery queued BEFORE rotation signs with the current secret (+ previous in grace), so it still verifies', async () => {
    const s = await webhook();
    await s.service.publish(event()); // queued under the old secret
    const d = s.db.deliveries.find((x) => x.channelId === s.ch.id)!;
    const rot: any = await s.service.rotateSecret('org-a', s.ch.id, {}, 'u1');
    const t = fakeTransport(200);
    s.processor.requestImpl = t.impl;
    await s.processor.deliver(job(d.id));
    const h = t.calls[0].options.headers;
    expect(verifyWebhook(s.secret0, h['X-SpendGuard-Signature'], h['X-SpendGuard-Timestamp'], t.calls[0].body)).toBe(true);
    expect(verifyWebhook(rot.signingSecret, h['X-SpendGuard-Signature'], h['X-SpendGuard-Timestamp'], t.calls[0].body)).toBe(true);
  });

  it('secrets never appear in API responses (list/update), history, audit or logs', async () => {
    const s = await webhook();
    const rot: any = await s.service.rotateSecret('org-a', s.ch.id, {}, 'u1');
    const logs: string[] = [];
    for (const m of ['log', 'warn', 'error', 'debug', 'verbose'] as const) jest.spyOn((s.service as any).logger, m).mockImplementation((x: any) => void logs.push(String(x)));
    await s.service.updateChannel('org-a', s.ch.id, { name: 'renamed' }, 'u1');
    await s.service.sendTest('org-a', s.ch.id, 'u1');
    const out = JSON.stringify([await s.service.listChannels('org-a'), await s.service.deliveries('org-a', {}), await s.service.channelAudit('org-a'), logs, s.db.auditRows]);
    expect(out).not.toContain(rot.signingSecret);
    expect(out).not.toContain(s.secret0);
    // The list shows only a host-level hint (e.g. "93.184.216.34/…"); the path and any query never appear
    expect(out).not.toMatch(/hooks\/spendguard|whsec_|encryptedConfig|previousSecret/);
  });
});

describe('channel audit trail', () => {
  it('records created, tested, rotated, paused, resumed and removed with actor and channel id, and no destination', async () => {
    const { service, db } = setup();
    const ch: any = await service.createChannel('org-a', 'u-admin', { type: 'WEBHOOK', name: 'Pager', config: { url: PUBLIC_URL } });
    await service.sendTest('org-a', ch.id, 'u-admin');
    await service.rotateSecret('org-a', ch.id, { immediate: true }, 'u-admin');
    await service.updateChannel('org-a', ch.id, { enabled: false }, 'u-admin');
    await service.updateChannel('org-a', ch.id, { enabled: true }, 'u-admin');
    await service.deleteChannel('org-a', ch.id, 'u-admin');
    const actions = db.auditRows.map((r) => r.action);
    expect(actions).toEqual(['notification.channel.created', 'notification.channel.tested', 'notification.channel.secret_rotated', 'notification.channel.paused', 'notification.channel.resumed', 'notification.channel.removed']);
    expect(db.auditRows.every((r) => r.orgId === 'org-a' && r.actor === 'u-admin' && JSON.parse(r.metadata).channelId === ch.id)).toBe(true);
    expect(JSON.stringify(db.auditRows)).not.toMatch(/93\.184|whsec_|hooks\/spendguard/);
  });
  it('a no-op update (same enabled state) is not audited as pause/resume', async () => {
    const { service, db } = setup();
    const ch: any = await service.createChannel('org-a', 'u1', { type: 'WEBHOOK', name: 'x', config: { url: PUBLIC_URL } });
    await service.updateChannel('org-a', ch.id, { enabled: true }, 'u1');
    expect(db.auditRows.map((r) => r.action)).toEqual(['notification.channel.created']);
  });
  it('a failed audit write is logged loudly but does not break the admin action', async () => {
    const { service, db } = setup();
    const err = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
    db.failAudit = true;
    await expect(service.createChannel('org-a', 'u1', { type: 'WEBHOOK', name: 'x', config: { url: PUBLIC_URL } })).resolves.toBeDefined();
    expect(err).toHaveBeenCalledWith(expect.stringContaining('AUDIT WRITE FAILED'));
  });
  it('the audit listing is scoped to the caller\'s organization', async () => {
    const { service } = setup();
    await service.createChannel('org-a', 'ua', { type: 'WEBHOOK', name: 'a', config: { url: PUBLIC_URL } });
    await service.createChannel('org-b', 'ub', { type: 'WEBHOOK', name: 'b', config: { url: PUBLIC_URL } });
    const a = await service.channelAudit('org-a');
    expect(a.events).toHaveLength(1);
    expect(a.events[0].actor).toBe('ua');
  });
});

describe('cross-tenant access to channels and deliveries', () => {
  it('every channel operation on another organization\'s channel id is a 404 and changes nothing', async () => {
    const { service, db } = setup();
    const ch: any = await service.createChannel('org-a', 'ua', { type: 'WEBHOOK', name: 'a', config: { url: PUBLIC_URL } });
    const before = JSON.stringify(db.channels);
    const ops: Array<() => Promise<unknown>> = [
      () => service.updateChannel('org-b', ch.id, { enabled: false }, 'ub'),
      () => service.deleteChannel('org-b', ch.id, 'ub'),
      () => service.rotateSecret('org-b', ch.id, {}, 'ub'),
      () => service.sendTest('org-b', ch.id, 'ub'),
    ];
    for (const op of ops) await expect(op()).rejects.toBeInstanceOf(NotFoundException);
    expect(JSON.stringify(db.channels)).toBe(before);
    expect(db.auditRows.filter((r) => r.orgId === 'org-b')).toHaveLength(0);
  });
  it('another organization\'s delivery id cannot be retried', async () => {
    const { service, db } = setup();
    const ch: any = await service.createChannel('org-a', 'ua', { type: 'WEBHOOK', name: 'a', config: { url: PUBLIC_URL } });
    await service.publish(event());
    const d = db.deliveries.find((x) => x.channelId === ch.id)!;
    d.status = 'FAILED';
    await expect(service.retryDelivery('org-b', d.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(d.status).toBe('FAILED');
  });
});

describe('pause / remove with queued deliveries', () => {
  it('a delivery queued for a channel that is paused before sending fails permanently with an honest reason and can be retried after resume', async () => {
    const { service, db, processor } = setup();
    const ch: any = await service.createChannel('org-a', 'u1', { type: 'WEBHOOK', name: 'w', config: { url: PUBLIC_URL } });
    await service.publish(event());
    const d = db.deliveries.find((x) => x.channelId === ch.id)!;
    await service.updateChannel('org-a', ch.id, { enabled: false }, 'u1');
    await expect(processor.deliver(job(d.id))).rejects.toThrow();
    expect(d).toMatchObject({ status: 'FAILED', lastError: expect.stringMatching(/deleted or disabled/) });
    await service.updateChannel('org-a', ch.id, { enabled: true }, 'u1');
    const t = fakeTransport(200);
    processor.requestImpl = t.impl;
    await service.retryDelivery('org-a', d.id);
    await processor.deliver(job(d.id));
    expect(d.status).toBe('SENT');
  });
  it('test-send goes through the same pinned, re-validated delivery path: a destination that turned internal is refused', async () => {
    const { service, db, processor } = setup();
    jest.spyOn(require('dns/promises'), 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const ch: any = await service.createChannel('org-a', 'u1', { type: 'WEBHOOK', name: 'w', config: { url: 'https://hooks.example.com/x' } });
    await service.sendTest('org-a', ch.id, 'u1');
    const d = db.deliveries.find((x) => x.channelId === ch.id && x.eventType === 'notification.test')!;
    const t = fakeTransport(200);
    processor.requestImpl = t.impl;
    processor.resolver = async () => ['10.1.2.3']; // DNS now answers internally
    await expect(processor.deliver(job(d.id))).rejects.toThrow();
    expect(t.calls).toHaveLength(0);
    expect(d).toMatchObject({ status: 'FAILED', lastError: expect.stringMatching(/Destination rejected/) });
  });
});
