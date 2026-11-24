import 'reflect-metadata';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { NotificationDeliveryProcessor } from '../src/modules/notifications/notification-delivery.processor';
import { AlertsService } from '../src/modules/alerts/alerts.service';
import { DELIVER_JOB_OPTS, NotificationEvent } from '../src/modules/notifications/notification.events';
import { FakeNotificationDb, fakeEncryption } from './helpers/notification-fakes';
import { fakeTransport } from './helpers/fake-transport';

const A = 'https://93.184.216.34/hooks/a';
const B = 'https://93.184.216.34/hooks/b';
const SLACK = 'https://hooks.slack.com/services/T000/B000/AAAAAAAA';
const SLACK2 = 'https://hooks.slack.com/services/T000/B000/BBBBBBBB';

beforeEach(() => {
  jest.spyOn(require('dns/promises'), 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});
afterEach(() => jest.restoreAllMocks());

const event = (id: string, extra: Partial<NotificationEvent> = {}): NotificationEvent => ({
  id, type: 'budget.alert', orgId: 'org-a', occurredAt: '2026-11-25T10:00:00.000Z', data: { title: 'Budget warning', message: 'm', severity: 'warning', projectId: 'p1' }, ...extra,
});
function setup() {
  const db = new FakeNotificationDb();
  const enc = fakeEncryption();
  const queue: any = { add: jest.fn(async () => ({})) };
  const service = new NotificationsService(db as any, enc as any, queue);
  const processor = new NotificationDeliveryProcessor(db as any, enc as any, { sendNotification: jest.fn(async () => true) } as any, service);
  return { db, enc, queue, service, processor };
}
const job = (deliveryId: string, attemptsMade = 0): any => ({ data: { deliveryId }, attemptsMade, opts: { attempts: DELIVER_JOB_OPTS.attempts }, name: 'deliver' });
const mk = (s: ReturnType<typeof setup>, type: 'SLACK' | 'WEBHOOK' | 'EMAIL', name: string, config: Record<string, unknown>) => s.service.createChannel('org-a', 'u1', { type, name, config }) as Promise<any>;

describe('one event, several different destinations: all receive it', () => {
  it('delivers once to each distinct channel, plus one inbox row', async () => {
    const s = setup();
    await mk(s, 'WEBHOOK', 'Pager', { url: A });
    await mk(s, 'WEBHOOK', 'Audit', { url: B });
    await mk(s, 'SLACK', 'Ops', { url: SLACK });
    const res = await s.service.publish(event('e1'));
    expect(res.deliveries).toBe(4); // 3 channels + in-app
    expect(s.db.deliveries.filter((d) => d.eventId === 'e1' && d.channelId).map((d) => d.channelType).sort()).toEqual(['SLACK', 'WEBHOOK', 'WEBHOOK']);
  });
});

describe('duplicate destination configuration is warned about, never silently dropped', () => {
  it('a second channel with the exact same URL is created, with a warning naming the first', async () => {
    const s = setup();
    const first = await mk(s, 'WEBHOOK', 'Pager', { url: A });
    expect(first.warnings).toEqual([]);
    const second = await mk(s, 'WEBHOOK', 'Pager copy', { url: A });
    expect(second.warnings.join()).toMatch(/Same destination as "Pager"/);
    expect(s.db.channels).toHaveLength(2); // nothing refused
    await s.service.publish(event('e1'));
    expect(s.db.deliveries.filter((d) => d.channelId)).toHaveLength(2); // both still receive it: no silent discarding
  });
  it('different URLs, or a different channel type with the same text, are not flagged', async () => {
    const s = setup();
    await mk(s, 'WEBHOOK', 'Pager', { url: A });
    expect((await mk(s, 'WEBHOOK', 'Other', { url: B })).warnings).toEqual([]);
    expect((await mk(s, 'SLACK', 'Slack one', { url: SLACK })).warnings).toEqual([]);
    expect((await mk(s, 'SLACK', 'Slack two', { url: SLACK2 })).warnings).toEqual([]); // may be the same Slack channel: cannot be known
  });
  it('email recipient lists are compared as sets (order and case do not matter)', async () => {
    const s = setup();
    await mk(s, 'EMAIL', 'Finance', { recipients: ['cfo@example.com', 'cto@example.com'] });
    const dup = await mk(s, 'EMAIL', 'Finance 2', { recipients: ['CTO@example.com', 'cfo@example.com'] });
    expect(dup.warnings.join()).toMatch(/Same destination as "Finance"/);
    expect((await mk(s, 'EMAIL', 'Only CFO', { recipients: ['cfo@example.com'] })).warnings).toEqual([]);
  });
  it('the listing flags both twins, and the warning disappears once one is removed', async () => {
    const s = setup();
    const a = await mk(s, 'WEBHOOK', 'Pager', { url: A });
    await mk(s, 'WEBHOOK', 'Pager copy', { url: A });
    const listed = (await s.service.listChannels('org-a')).channels;
    expect(listed.every((c: any) => c.warnings.length === 1)).toBe(true);
    await s.service.deleteChannel('org-a', a.id, 'u1');
    expect((await s.service.listChannels('org-a')).channels[0].warnings).toEqual([]);
  });
  it('the stored hash is not the destination, and is never returned by the API', async () => {
    const s = setup();
    const c = await mk(s, 'WEBHOOK', 'Pager', { url: A });
    expect(s.db.channels[0].destinationHash).toBeTruthy();
    expect(s.db.channels[0].destinationHash).not.toContain('hooks/a');
    expect(JSON.stringify([c, await s.service.listChannels('org-a')])).not.toContain(s.db.channels[0].destinationHash);
  });
  it('another organization with the same URL is not flagged (comparison is per organization)', async () => {
    const s = setup();
    await mk(s, 'WEBHOOK', 'Pager', { url: A });
    const other = await s.service.createChannel('org-b', 'u2', { type: 'WEBHOOK', name: 'Same URL elsewhere', config: { url: A } }) as any;
    expect(other.warnings).toEqual([]);
  });
});

describe('project-level Slack webhook versus organization Slack channel', () => {
  it('creating an org Slack channel that equals a project webhook warns, naming the project', async () => {
    const s = setup();
    s.db.alertConfigs.push({ slackWebhookUrl: s.enc.encryptApiKey(SLACK), project: { name: 'Support' } });
    const ch = await mk(s, 'SLACK', 'Ops', { url: SLACK });
    expect(ch.warnings.join()).toMatch(/alert webhook of project "Support".*twice/);
    expect(s.db.channels).toHaveLength(1);
  });
  it('a different Slack URL is not claimed to be a duplicate (equivalence cannot be established)', async () => {
    const s = setup();
    s.db.alertConfigs.push({ slackWebhookUrl: s.enc.encryptApiKey(SLACK), project: { name: 'Support' } });
    expect((await mk(s, 'SLACK', 'Ops', { url: SLACK2 })).warnings).toEqual([]);
  });
  it('the channel listing shows the overlap too', async () => {
    const s = setup();
    await mk(s, 'SLACK', 'Ops', { url: SLACK });
    s.db.alertConfigs.push({ slackWebhookUrl: s.enc.encryptApiKey(SLACK), project: { name: 'Support' } });
    expect((await s.service.listChannels('org-a')).channels[0].warnings.join()).toMatch(/"Support"/);
  });
  it('saving the project webhook warns when an org channel already uses it (and still saves)', async () => {
    const s = setup();
    await mk(s, 'SLACK', 'Ops', { url: SLACK });
    const prisma: any = {
      project: { findFirst: async () => ({ id: 'p1', orgId: 'org-a' }), findUnique: async () => ({ id: 'p1', orgId: 'org-a' }) },
      alertConfig: { upsert: jest.fn(async () => ({})), findUnique: async () => ({ slackWebhookUrl: 'x' }) },
      budgetAlert: { findFirst: async () => null },
    };
    const alerts = new AlertsService(prisma, s.enc as any, {} as any, s.service);
    const out: any = await alerts.setSlackWebhook('org-a', 'p1', SLACK);
    expect(prisma.alertConfig.upsert).toHaveBeenCalled();
    expect(out.warnings.join()).toMatch(/"Ops".*twice/);
    const different: any = await alerts.setSlackWebhook('org-a', 'p1', SLACK2);
    expect(different.warnings).toEqual([]);
  });
  it('both notification paths still deliver (nothing is suppressed): the project path is independent of organization channels', async () => {
    const s = setup();
    await mk(s, 'SLACK', 'Ops', { url: SLACK });
    s.db.alertConfigs.push({ slackWebhookUrl: s.enc.encryptApiKey(SLACK), project: { name: 'Support' } });
    await s.service.publish(event('alert:1'));
    expect(s.db.deliveries.filter((d) => d.channelId)).toHaveLength(1);
  });
});

describe('event identity is separate from delivery identity', () => {
  it('re-publishing the same event id (duplicate ingestion) creates no second delivery for any destination or the inbox', async () => {
    const s = setup();
    await mk(s, 'WEBHOOK', 'Pager', { url: A });
    await mk(s, 'WEBHOOK', 'Audit', { url: B });
    await s.service.publish(event('same'));
    const again = await s.service.publish(event('same'));
    expect(again.deliveries).toBe(0);
    expect(s.db.deliveries).toHaveLength(3); // 2 destinations + 1 inbox row, still
  });
  it('a different event id is a different event even with identical content', async () => {
    const s = setup();
    await mk(s, 'WEBHOOK', 'Pager', { url: A });
    await s.service.publish(event('one'));
    await s.service.publish(event('two'));
    expect(s.db.deliveries.filter((d) => d.channelId)).toHaveLength(2);
  });
  it('concurrent publishes of the same event create exactly one delivery per destination and one inbox row', async () => {
    const s = setup();
    await mk(s, 'WEBHOOK', 'Pager', { url: A });
    await mk(s, 'SLACK', 'Ops', { url: SLACK });
    const results = await Promise.all(Array.from({ length: 12 }, () => s.service.publish(event('race'))));
    expect(results.reduce((n, r) => n + r.deliveries, 0)).toBe(3);
    expect(s.db.deliveries.filter((d) => d.eventId === 'race')).toHaveLength(3);
    expect(s.db.deliveries.filter((d) => d.eventId === 'race' && !d.channelId)).toHaveLength(1);
  });
  it('concurrent publishes of different events never collide', async () => {
    const s = setup();
    await mk(s, 'WEBHOOK', 'Pager', { url: A });
    await Promise.all(Array.from({ length: 20 }, (_, i) => s.service.publish(event(`ev-${i}`))));
    expect(s.db.deliveries.filter((d) => d.channelId)).toHaveLength(20);
    expect(s.db.deliveries.filter((d) => !d.channelId)).toHaveLength(20);
  });
  it('the same event id in two organizations is two inbox rows (the key includes the organization)', async () => {
    const s = setup();
    await s.service.publish(event('shared'));
    await s.service.publish(event('shared', { orgId: 'org-b' }));
    expect(s.db.deliveries.filter((d) => !d.channelId)).toHaveLength(2);
  });
});

describe('retry of the same delivery never duplicates the send', () => {
  it('a successful delivery re-run by a duplicate job sends once; a retry after failure sends again but stays ONE delivery row', async () => {
    const s = setup();
    const ch = await mk(s, 'WEBHOOK', 'Pager', { url: A });
    await s.service.publish(event('e1'));
    const d = s.db.deliveries.find((x) => x.channelId === ch.id)!;

    const fail = fakeTransport(500);
    s.processor.requestImpl = fail.impl;
    await expect(s.processor.deliver(job(d.id, 0))).rejects.toThrow();
    expect(d.status).toBe('RETRYING');

    const ok = fakeTransport(200);
    s.processor.requestImpl = ok.impl;
    await s.processor.deliver(job(d.id, 1));
    await s.processor.deliver(job(d.id, 2)); // duplicate job after success
    expect(ok.calls).toHaveLength(1);
    expect(d.status).toBe('SENT');
    expect(s.db.deliveries.filter((x) => x.channelId === ch.id)).toHaveLength(1);
  });
  it('the stale-delivery sweep re-queues a QUEUED row under a time-bucketed job id, so repeated sweeps cannot stack jobs', async () => {
    const s = setup();
    await mk(s, 'WEBHOOK', 'Pager', { url: A });
    await s.service.publish(event('e1'));
    s.db.deliveries.find((x) => x.channelId)!.createdAt = new Date(Date.now() - 10 * 60_000);
    await s.service.requeueStale();
    await s.service.requeueStale();
    const ids = s.queue.add.mock.calls.map((c: any[]) => c[2].jobId).filter((j: string) => /-r\d+$/.test(j));
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(1); // BullMQ collapses identical job ids: one active job per delivery per hour bucket
  });
});
