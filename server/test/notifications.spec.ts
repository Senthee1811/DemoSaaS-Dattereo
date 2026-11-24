import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { createHmac } from 'crypto';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { DeliveryError, NotificationDeliveryProcessor } from '../src/modules/notifications/notification-delivery.processor';
import { NotificationsController } from '../src/modules/notifications/notifications.controller';
import { assertSafeDestination, isPrivateAddress } from '../src/modules/notifications/url-safety';
import { generateWebhookSecret, signWebhook, verifyWebhook } from '../src/modules/notifications/signing';
import { DELIVER_JOB_OPTS, NotificationEvent } from '../src/modules/notifications/notification.events';
import { FakeNotificationDb, fakeEncryption } from './helpers/notification-fakes';

const env = { ...process.env };
const realFetch = global.fetch;
afterEach(() => {
  process.env = { ...env };
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

const PUBLIC_URL = 'https://93.184.216.34/hooks/spendguard'; // a public IP literal: no DNS needed
const SLACK_URL = 'https://hooks.slack.com/services/T000/B000/XXXXXXXX';

const event = (extra: Partial<NotificationEvent> = {}): NotificationEvent => ({
  id: `evt-${Math.random().toString(36).slice(2)}`, type: 'budget.alert', orgId: 'org-a', occurredAt: '2026-11-25T10:00:00.000Z',
  data: { title: 'Budget warning: Support', message: 'Support used 85% of its monthly budget.', severity: 'warning' }, ...extra,
});

function setup() {
  const db = new FakeNotificationDb();
  const enc = fakeEncryption();
  const queue: any = { add: jest.fn(async () => ({})) };
  const service = new NotificationsService(db as any, enc as any, queue);
  const email: any = { sendNotification: jest.fn(async () => true) };
  const processor = new NotificationDeliveryProcessor(db as any, enc as any, email, service);
  return { db, enc, queue, service, email, processor };
}

// ── destination safety ──────────────────────────────────────────────────────
describe('SSRF defence for user-supplied destinations', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1'])('%s is private/internal', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });
  it.each(['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111'])('%s is public', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it.each([
    ['http (not https)', 'http://93.184.216.34/x', /https/],
    ['localhost literal', 'https://127.0.0.1/x', /private or internal/],
    ['cloud metadata address', 'https://169.254.169.254/latest/meta-data', /private or internal/],
    ['RFC1918', 'https://10.0.0.5/hook', /private or internal/],
    ['IPv6 loopback', 'https://[::1]/hook', /private or internal/],
    ['embedded credentials', 'https://user:pass@93.184.216.34/x', /credentials/],
    ['not a URL', 'not a url', /not valid/],
    ['javascript scheme', 'javascript:alert(1)', /https/],
    ['file scheme', 'file:///etc/passwd', /https/],
  ])('rejects %s', async (_n, url, msg) => {
    await expect(assertSafeDestination(url)).rejects.toThrow(msg);
  });

  it('a hostname that RESOLVES to a private address is rejected (not just literals)', async () => {
    jest.resetModules();
    jest.doMock('dns/promises', () => ({ lookup: async () => [{ address: '10.0.0.7', family: 4 }] }));
    const { assertSafeDestination: guarded } = await import('../src/modules/notifications/url-safety');
    await expect(guarded('https://internal.example.com/hook')).rejects.toThrow(/private or internal/);
    jest.dontMock('dns/promises');
  });

  it('…and so is a hostname where ANY of several answers is private', async () => {
    jest.resetModules();
    jest.doMock('dns/promises', () => ({ lookup: async () => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }] }));
    const { assertSafeDestination: guarded } = await import('../src/modules/notifications/url-safety');
    await expect(guarded('https://rebind.example.com/hook')).rejects.toThrow(/private or internal/);
    jest.dontMock('dns/promises');
  });

  it('an unresolvable host is rejected with a clear message', async () => {
    jest.resetModules();
    jest.doMock('dns/promises', () => ({ lookup: async () => { throw new Error('ENOTFOUND'); } }));
    const { assertSafeDestination: guarded } = await import('../src/modules/notifications/url-safety');
    await expect(guarded('https://nope.invalid/hook')).rejects.toThrow(/could not be resolved/);
    jest.dontMock('dns/promises');
  });

  it('local development can opt in to http + private networks explicitly', async () => {
    process.env.NOTIFICATION_ALLOW_HTTP = 'true';
    process.env.NOTIFICATION_ALLOW_PRIVATE_NETWORKS = 'true';
    await expect(assertSafeDestination('http://127.0.0.1:9999/hook')).resolves.toBeInstanceOf(URL);
  });

  it('the host allow-list (Slack) is enforced', async () => {
    await expect(assertSafeDestination('https://93.184.216.34/x', { hosts: ['hooks.slack.com'] })).rejects.toThrow(/must be on hooks.slack.com/);
  });
});

// ── signing ─────────────────────────────────────────────────────────────────
describe('webhook signing', () => {
  const secret = 'whsec_test';
  const body = '{"id":"e1","type":"budget.alert"}';

  it('is HMAC-SHA256 over "<timestamp>.<raw body>" and is independently verifiable', () => {
    const sig = signWebhook(secret, 1_790_000_000, body);
    expect(sig).toBe(`v1=${createHmac('sha256', secret).update(`1790000000.${body}`).digest('hex')}`);
  });
  it('verifies the genuine signature within the tolerance window', () => {
    const ts = 1_790_000_000;
    expect(verifyWebhook(secret, signWebhook(secret, ts, body), String(ts), body, ts + 60)).toBe(true);
  });
  it.each([
    ['a tampered body', (s: string, ts: number) => verifyWebhook(secret, s, String(ts), body + ' ', ts + 1)],
    ['a different secret', (s: string, ts: number) => verifyWebhook('whsec_other', s, String(ts), body, ts + 1)],
    ['a replay after the tolerance window', (s: string, ts: number) => verifyWebhook(secret, s, String(ts), body, ts + 301)],
    ['a timestamp from the future', (s: string, ts: number) => verifyWebhook(secret, s, String(ts), body, ts - 400)],
    ['a truncated signature', (s: string, ts: number) => verifyWebhook(secret, s.slice(0, -2), String(ts), body, ts)],
    ['a non-numeric timestamp', (s: string) => verifyWebhook(secret, s, 'abc', body)],
  ])('rejects %s', (_n, check) => {
    const ts = 1_790_000_000;
    expect(check(signWebhook(secret, ts, body), ts)).toBe(false);
  });
  it('generates distinct, unguessable secrets', () => {
    const a = generateWebhookSecret();
    expect(a).toMatch(/^whsec_[0-9a-f]{48}$/);
    expect(a).not.toBe(generateWebhookSecret());
  });
});

// ── publishing ──────────────────────────────────────────────────────────────
describe('publishing an event', () => {
  async function withChannels() {
    const s = setup();
    process.env.NOTIFICATION_SLACK_HOSTS = '';
    const slack = await s.service.createChannel('org-a', 'u1', { type: 'SLACK', name: 'Alerts', config: { url: SLACK_URL } });
    const hook = await s.service.createChannel('org-a', 'u1', { type: 'WEBHOOK', name: 'Pager', config: { url: PUBLIC_URL }, eventTypes: ['recommendation.created'] });
    const mail = await s.service.createChannel('org-a', 'u1', { type: 'EMAIL', name: 'Finance', config: { recipients: ['cfo@example.com'] } });
    return { ...s, slack, hook, mail };
  }

  it('fans out to every enabled channel that wants the event type, plus the in-app inbox', async () => {
    jest.spyOn(require('dns/promises'), 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const { service, db, queue } = await withChannels();
    const res = await service.publish(event()); // budget.alert: the webhook only wants recommendations
    expect(res.deliveries).toBe(3); // in-app + slack + email
    expect(db.deliveries.map((d) => d.channelType).sort()).toEqual(['EMAIL', 'IN_APP', 'SLACK']);
    expect(queue.add).toHaveBeenCalledTimes(2); // in-app is delivered immediately, the others are queued
    expect(db.deliveries.find((d) => d.channelType === 'IN_APP')).toMatchObject({ status: 'SENT', channelId: null });
    expect(db.deliveries.filter((d) => d.channelType !== 'IN_APP').every((d) => d.status === 'QUEUED')).toBe(true);
  });

  it('a recommendation event reaches the channel that asked for it', async () => {
    jest.spyOn(require('dns/promises'), 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const { service, db } = await withChannels();
    await service.publish(event({ type: 'recommendation.created' }));
    expect(db.deliveries.some((d) => d.channelType === 'WEBHOOK')).toBe(true);
  });

  it('is IDEMPOTENT: publishing the same event id twice creates no second delivery anywhere', async () => {
    jest.spyOn(require('dns/promises'), 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const { service, db, queue } = await withChannels();
    const e = event();
    await service.publish(e);
    const first = db.deliveries.length;
    const queued = queue.add.mock.calls.length;
    const again = await service.publish(e);
    expect(again.deliveries).toBe(0);
    expect(db.deliveries).toHaveLength(first);
    expect(queue.add).toHaveBeenCalledTimes(queued);
  });

  it('disabled channels and other organizations\' channels receive nothing', async () => {
    jest.spyOn(require('dns/promises'), 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const { service, db, mail } = await withChannels();
    await service.updateChannel('org-a', mail.id, { enabled: false });
    await service.createChannel('org-b', 'u2', { type: 'EMAIL', name: 'Other org', config: { recipients: ['x@other.example'] } });
    await service.publish(event());
    expect(db.deliveries.some((d) => d.channelType === 'EMAIL')).toBe(false);
    expect(db.deliveries.every((d) => d.orgId === 'org-a')).toBe(true);
  });

  it('writes the delivery row BEFORE queueing; a queue failure leaves a QUEUED row that the recovery sweep re-queues', async () => {
    jest.spyOn(require('dns/promises'), 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const { service, db, queue } = await withChannels();
    queue.add.mockRejectedValue(new Error('redis down'));
    await expect(service.publish(event())).resolves.toMatchObject({ deliveries: 3 });
    const pending = db.deliveries.filter((d) => d.channelId);
    expect(pending.every((d) => d.status === 'QUEUED')).toBe(true);

    queue.add.mockResolvedValue({});
    pending.forEach((d) => (d.createdAt = new Date(Date.now() - 10 * 60_000)));
    expect(await service.requeueStale()).toBe(pending.length);
    expect(queue.add.mock.calls.at(-1)[2].jobId).toMatch(/^deliver-.*-r\d+$/);
  });

  it('never throws into the producer (a budget decision or recommendation run must not fail because notifying failed)', async () => {
    const { service, db } = setup();
    db.failDeliveryCreate = true;
    await expect(service.publish(event())).resolves.toEqual({ deliveries: 0 });
    await expect(service.publish({ ...event(), type: 'nonsense' as any })).resolves.toEqual({ deliveries: 0 });
  });
});

// ── channels and credentials ────────────────────────────────────────────────
describe('channels: credentials are stored encrypted and never returned', () => {
  beforeEach(() => {
    jest.spyOn(require('dns/promises'), 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });

  it('the stored config is ciphertext; the API response shows only a non-sensitive hint', async () => {
    const { service, db } = setup();
    const out = await service.createChannel('org-a', 'u1', { type: 'SLACK', name: 'Alerts', config: { url: SLACK_URL } });
    expect(db.channels[0].encryptedConfig).not.toContain('hooks.slack.com');
    expect(db.channels[0].encryptedConfig).not.toContain('XXXXXXXX');
    expect(JSON.stringify(out)).not.toContain('XXXXXXXX');
    expect(JSON.stringify(out)).not.toMatch(/encryptedConfig|services\/T000/);
    expect(out.destination).toBe('hooks.slack.com/…');
  });

  it('a webhook signing secret is returned ONCE at creation and never again (list, update, rotate-less reads)', async () => {
    const { service, db } = setup();
    const created = await service.createChannel('org-a', 'u1', { type: 'WEBHOOK', name: 'Pager', config: { url: PUBLIC_URL } });
    expect(created.signingSecret).toMatch(/^whsec_/);
    expect(created.signingSecretNote).toMatch(/once/i);
    expect(db.channels[0].encryptedConfig).not.toContain(created.signingSecret);
    const listed = JSON.stringify(await service.listChannels('org-a'));
    expect(listed).not.toContain(created.signingSecret);
    expect(listed).not.toContain('93.184.216.34/hooks');
    expect(JSON.stringify(await service.updateChannel('org-a', created.id, { name: 'Renamed' }))).not.toContain(created.signingSecret);
  });

  it('rotating the secret issues a new one once; the old one stops verifying', async () => {
    const { service, db, enc } = setup();
    const created = await service.createChannel('org-a', 'u1', { type: 'WEBHOOK', name: 'Pager', config: { url: PUBLIC_URL } });
    const rotated = await service.rotateSecret('org-a', created.id);
    expect(rotated.signingSecret).not.toBe(created.signingSecret);
    expect(JSON.parse(enc.decryptApiKey(db.channels[0].encryptedConfig)).secret).toBe(rotated.signingSecret);
    await expect(service.rotateSecret('org-a', (await service.createChannel('org-a', 'u1', { type: 'EMAIL', name: 'm', config: { recipients: ['a@b.co'] } })).id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('email recipients are masked in the hint and validated (1–10 addresses)', async () => {
    const { service } = setup();
    const out = await service.createChannel('org-a', 'u1', { type: 'EMAIL', name: 'Finance', config: { recipients: ['Alice@Example.com', 'alice@example.com', 'bob@example.com'] } });
    expect(out.destination).toBe('a***@example.com, b***@example.com'); // lower-cased and de-duplicated
    for (const recipients of [[], ['not-an-email'], Array.from({ length: 11 }, (_, i) => `u${i}@example.com`), ['a@b.co', 'x y@z.com']]) {
      await expect(service.createChannel('org-a', 'u1', { type: 'EMAIL', name: 'x', config: { recipients } })).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('Slack must be a Slack host; webhooks must be public https; both reject internal targets at creation time', async () => {
    const { service } = setup();
    await expect(service.createChannel('org-a', 'u1', { type: 'SLACK', name: 'x', config: { url: 'https://93.184.216.34/x' } })).rejects.toThrow(/hooks.slack.com/);
    await expect(service.createChannel('org-a', 'u1', { type: 'WEBHOOK', name: 'x', config: { url: 'https://169.254.169.254/latest' } })).rejects.toThrow(/private or internal/);
    await expect(service.createChannel('org-a', 'u1', { type: 'WEBHOOK', name: 'x', config: { url: 'http://93.184.216.34/x' } })).rejects.toThrow(/https/);
  });

  it('validates type, name, event types and the per-organization limit', async () => {
    const { service } = setup();
    await expect(service.createChannel('org-a', 'u1', { type: 'FAX', name: 'x', config: {} })).rejects.toThrow(/type must be one of/);
    await expect(service.createChannel('org-a', 'u1', { type: 'EMAIL', name: '   ', config: { recipients: ['a@b.co'] } })).rejects.toThrow(/name is required/);
    await expect(service.createChannel('org-a', 'u1', { type: 'EMAIL', name: 'x', config: { recipients: ['a@b.co'] }, eventTypes: ['bogus'] })).rejects.toThrow(/eventTypes/);
    for (let i = 0; i < 20; i++) await service.createChannel('org-a', 'u1', { type: 'EMAIL', name: `c${i}`, config: { recipients: ['a@b.co'] } });
    await expect(service.createChannel('org-a', 'u1', { type: 'EMAIL', name: 'one too many', config: { recipients: ['a@b.co'] } })).rejects.toThrow(/at most 20/);
  });
});

describe('channels: tenant isolation', () => {
  it("another organization's channel id is a 404 for every operation (indistinguishable from nonexistent)", async () => {
    jest.spyOn(require('dns/promises'), 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const { service } = setup();
    const mine = await service.createChannel('org-a', 'u1', { type: 'WEBHOOK', name: 'Mine', config: { url: PUBLIC_URL } });
    await expect(service.updateChannel('org-b', mine.id, { enabled: false })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteChannel('org-b', mine.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.rotateSecret('org-b', mine.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.sendTest('org-b', mine.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await service.listChannels('org-b')).channels).toHaveLength(0);
    expect((await service.listChannels('org-a')).channels).toHaveLength(1);
  });

  it('delivery history, retry and the inbox are scoped to the organization', async () => {
    jest.spyOn(require('dns/promises'), 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const { service, db } = setup();
    await service.createChannel('org-a', 'u1', { type: 'EMAIL', name: 'm', config: { recipients: ['a@b.co'] } });
    await service.publish(event({ orgId: 'org-a' }));
    await service.publish(event({ orgId: 'org-b' }));
    expect((await service.deliveries('org-b', {})).deliveries.every((d) => d.channelType === 'IN_APP')).toBe(true);
    expect((await service.deliveries('org-a', {})).total).toBe(2);
    expect((await service.inbox('org-b')).items).toHaveLength(1);
    const aDelivery = db.deliveries.find((d) => d.orgId === 'org-a' && d.channelId)!;
    aDelivery.status = 'FAILED';
    await expect(service.retryDelivery('org-b', aDelivery.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await service.markRead('org-b')).toEqual({ updated: 1 });
    expect(db.deliveries.find((d) => d.orgId === 'org-a' && !d.channelId)!.readAt).toBeNull(); // org A's inbox untouched
  });

  it('the HTTP layer takes the organization from the token only, never from the request', () => {
    const calls: any[] = [];
    const svc: any = new Proxy({}, { get: (_t, name) => (...args: any[]) => { calls.push([name, args]); return {}; } });
    const c = new NotificationsController(svc);
    c.list({ orgId: 'org-a', id: 'u', role: 'ADMIN' } as any);
    c.deliveries({ orgId: 'org-a' } as any, undefined, undefined, '99999', '-3');
    expect(calls[0]).toEqual(['listChannels', ['org-a']]);
    expect(calls[1][1][0]).toBe('org-a');
    expect(calls[1][1][1]).toMatchObject({ limit: 200, offset: 0 }); // clamped
  });
});

// ── delivery ────────────────────────────────────────────────────────────────
describe('delivery: Slack, signed webhook and email', () => {
  beforeEach(() => {
    jest.spyOn(require('dns/promises'), 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });
  const job = (deliveryId: string, attemptsMade = 0): any => ({ data: { deliveryId }, attemptsMade, opts: { attempts: DELIVER_JOB_OPTS.attempts }, name: 'deliver' });
  async function queued(type: 'SLACK' | 'WEBHOOK' | 'EMAIL') {
    const s = setup();
    const config = type === 'SLACK' ? { url: SLACK_URL } : type === 'WEBHOOK' ? { url: PUBLIC_URL } : { recipients: ['cfo@example.com'] };
    const ch = await s.service.createChannel('org-a', 'u1', { type, name: 'c', config });
    await s.service.publish(event());
    const d = s.db.deliveries.find((x) => x.channelId === ch.id)!;
    return { ...s, ch, d, secret: (ch as any).signingSecret as string };
  }
  const ok = () => jest.fn(async () => new Response('ok', { status: 200 }));

  it('webhook: POSTs the event signed with the channel secret (verifiable with the documented scheme), marks SENT', async () => {
    const { processor, d, db, secret } = await queued('WEBHOOK');
    const f = (global.fetch = ok() as any) as jest.Mock;
    await processor.deliver(job(d.id));
    const [url, init] = f.mock.calls[0] as unknown as [URL, any];
    expect(String(url)).toBe(PUBLIC_URL);
    expect(init.redirect).toBe('manual');
    expect(init.headers['X-SpendGuard-Event']).toBe('budget.alert');
    expect(init.headers['X-SpendGuard-Delivery']).toBe(d.id);
    expect(verifyWebhook(secret, init.headers['X-SpendGuard-Signature'], init.headers['X-SpendGuard-Timestamp'], init.body)).toBe(true);
    expect(JSON.parse(init.body)).toMatchObject({ type: 'budget.alert', orgId: 'org-a', data: { title: 'Budget warning: Support' } });
    expect(init.body).not.toContain(secret);
    expect(db.deliveries.find((x) => x.id === d.id)).toMatchObject({ status: 'SENT', attempts: 1, lastError: null });
  });

  it('slack: posts a text + block payload, escaping markup, with no signature headers', async () => {
    const { processor, d, db } = await queued('SLACK');
    db.deliveries.find((x) => x.id === d.id)!.payload.data.message = 'Spend <!channel> & more';
    const f = (global.fetch = ok() as any) as jest.Mock;
    await processor.deliver(job(d.id));
    const init = (f.mock.calls[0] as any)[1];
    const body = JSON.parse(init.body);
    expect(body.blocks[0].text.text).toContain('Spend &lt;!channel&gt; &amp; more');
    expect(init.headers['X-SpendGuard-Signature']).toBeUndefined();
  });

  it('email: sends to every recipient; refuses when email is not configured (permanent, honest reason)', async () => {
    const { processor, d, email, db } = await queued('EMAIL');
    process.env.RESEND_API_KEY = 're_test';
    await processor.deliver(job(d.id));
    expect(email.sendNotification).toHaveBeenCalledWith('cfo@example.com', '[SpendGuard] Budget warning: Support', expect.objectContaining({ text: expect.any(String), html: expect.not.stringContaining('<script') }));
    expect(db.deliveries.find((x) => x.id === d.id)!.status).toBe('SENT');

    const second = await queued('EMAIL');
    delete process.env.RESEND_API_KEY;
    await expect(second.processor.deliver(job(second.d.id))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(second.db.deliveries.find((x) => x.id === second.d.id)).toMatchObject({ status: 'FAILED', lastError: expect.stringMatching(/not configured/) });
  });

  it('TRANSIENT failures (5xx, 429, 408, network, timeout) go RETRYING with the attempt recorded, and FAILED after the last attempt', async () => {
    for (const status of [500, 502, 429, 408]) {
      const { processor, d, db } = await queued('WEBHOOK');
      global.fetch = jest.fn(async () => new Response('x', { status })) as any;
      await expect(processor.deliver(job(d.id, 0))).rejects.not.toBeInstanceOf(UnrecoverableError);
      expect(db.deliveries.find((x) => x.id === d.id)).toMatchObject({ status: 'RETRYING', attempts: 1, lastError: `The destination answered HTTP ${status}` });
    }
    const { processor, d, db } = await queued('WEBHOOK');
    global.fetch = jest.fn(async () => { throw new Error('connect ECONNREFUSED https://93.184.216.34/hooks/spendguard'); }) as any;
    await expect(processor.deliver(job(d.id, 0))).rejects.toThrow();
    expect(db.deliveries.find((x) => x.id === d.id)!.lastError).toBe('Could not reach the destination'); // the URL in the error text is NOT echoed
    await expect(processor.deliver(job(d.id, DELIVER_JOB_OPTS.attempts - 1))).rejects.toThrow();
    expect(db.deliveries.find((x) => x.id === d.id)).toMatchObject({ status: 'FAILED', attempts: 2 });
  });

  it('PERMANENT failures (4xx other than 408/429, redirects, unsafe destination) fail at once without burning retries', async () => {
    for (const status of [400, 401, 403, 404, 410, 302]) {
      const { processor, d, db } = await queued('WEBHOOK');
      global.fetch = jest.fn(async () => new Response('', { status })) as any;
      await expect(processor.deliver(job(d.id))).rejects.toBeInstanceOf(UnrecoverableError);
      expect(db.deliveries.find((x) => x.id === d.id)!.status).toBe('FAILED');
    }
  });

  it('re-validates the destination at delivery time: a channel whose host now resolves internally is not called', async () => {
    const { processor, d, db } = await queued('WEBHOOK');
    jest.spyOn(require('dns/promises'), 'lookup').mockResolvedValue([{ address: '10.0.0.9', family: 4 }]);
    // the stored URL is an IP literal; swap it for a hostname that now resolves to a private address
    const ch = db.channels[0];
    ch.encryptedConfig = (setup().enc as any).encryptApiKey(JSON.stringify({ url: 'https://hooks.example.com/x', secret: 's' }));
    const enc = fakeEncryption();
    (processor as any).encryption = enc;
    ch.encryptedConfig = enc.encryptApiKey(JSON.stringify({ url: 'https://hooks.example.com/x', secret: 's' }));
    const f = (global.fetch = jest.fn() as any) as jest.Mock;
    await expect(processor.deliver(job(d.id))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(f).not.toHaveBeenCalled();
    expect(db.deliveries.find((x) => x.id === d.id)!.lastError).toMatch(/Destination rejected/);
  });

  it('is idempotent: a duplicate job for a SENT delivery does nothing; a deleted/disabled channel fails permanently', async () => {
    const { processor, d, db, service, ch } = await queued('WEBHOOK');
    const f = (global.fetch = ok() as any) as jest.Mock;
    await processor.deliver(job(d.id));
    await processor.deliver(job(d.id));
    expect(f).toHaveBeenCalledTimes(1);

    const other = await queued('WEBHOOK');
    await other.service.updateChannel('org-a', other.ch.id, { enabled: false });
    await expect(other.processor.deliver(job(other.d.id))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(other.db.deliveries.find((x) => x.id === other.d.id)!.lastError).toMatch(/deleted or disabled/);
    void service; void ch; void db;
  });

  it('the history never stores the destination URL, secret or recipients', async () => {
    const { processor, d, service } = await queued('WEBHOOK');
    global.fetch = jest.fn(async () => new Response('', { status: 500 })) as any;
    await processor.deliver(job(d.id)).catch(() => undefined);
    const out = JSON.stringify(await service.deliveries('org-a', {}));
    expect(out).not.toMatch(/93\.184\.216\.34|whsec_|encryptedConfig/);
  });

  it('a manual retry re-queues only FAILED deliveries', async () => {
    const { service, d, db, queue } = await queued('WEBHOOK');
    await expect(service.retryDelivery('org-a', d.id)).rejects.toThrow(/Only failed/);
    db.deliveries.find((x) => x.id === d.id)!.status = 'FAILED';
    await expect(service.retryDelivery('org-a', d.id)).resolves.toEqual({ requeued: true });
    expect(db.deliveries.find((x) => x.id === d.id)).toMatchObject({ status: 'QUEUED', attempts: 0 });
    expect(queue.add.mock.calls.at(-1)[2].jobId).toMatch(/-manual/);
  });

  it('a final failure event can never leave the row looking in-flight', async () => {
    const { processor, d, db } = await queued('WEBHOOK');
    await processor.onFailed({ name: 'deliver', data: { deliveryId: d.id }, attemptsMade: DELIVER_JOB_OPTS.attempts, opts: { attempts: DELIVER_JOB_OPTS.attempts } } as any, new Error('x'));
    expect(db.deliveries.find((x) => x.id === d.id)!.status).toBe('FAILED');
    const e = await queued('WEBHOOK');
    await e.processor.onFailed({ name: 'deliver', data: { deliveryId: e.d.id }, attemptsMade: 1, opts: { attempts: 5 } } as any, new Error('x'));
    expect(e.db.deliveries.find((x) => x.id === e.d.id)!.status).toBe('QUEUED'); // retries remain
  });
});

describe('in-app inbox', () => {
  it('shows events, counts unread, and marks read', async () => {
    const { service } = setup();
    await service.publish(event({ id: 'e1', data: { title: 'One', message: 'm' } }));
    await service.publish(event({ id: 'e2', data: { title: 'Two', message: 'm' } }));
    const inbox = await service.inbox('org-a');
    expect(inbox.unread).toBe(2);
    expect(inbox.items.map((i: any) => i.title).sort()).toEqual(['One', 'Two']);
    await service.markRead('org-a', [inbox.items[0].id]);
    expect((await service.inbox('org-a')).unread).toBe(1);
    expect((await service.inbox('org-a', true)).items).toHaveLength(1);
  });
});

it('DeliveryError carries whether retrying can help', () => {
  expect(new DeliveryError('x', true).permanent).toBe(true);
  expect(new DeliveryError('x', false).permanent).toBe(false);
});
