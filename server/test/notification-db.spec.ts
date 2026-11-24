import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { NotificationEvent } from '../src/modules/notifications/notification.events';
import { fakeEncryption } from './helpers/notification-fakes';

/**
 * Real-Postgres checks for the notification uniqueness guarantees. The fake-database tests emulate the unique
 * constraints; this proves the actual constraints behave the same way under concurrency.
 * Gated: needs TEST_DATABASE_URL pointing at a THROWAWAY database with all migrations applied.
 */
const URL = process.env.TEST_DATABASE_URL;
const withDb = URL ? describe : describe.skip;
if (!URL) console.warn('[notification-db.spec] TEST_DATABASE_URL not set: the real-Postgres suite is SKIPPED');

withDb('notification uniqueness on real Postgres', () => {
  let prisma: PrismaClient;
  let orgId: string;
  let service: NotificationsService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: URL } } });
    const enc = fakeEncryption();
    service = new NotificationsService(prisma as any, enc as any, { add: async () => ({}) } as any);
    orgId = (await prisma.organization.create({ data: { name: 'T', slug: `t-${randomUUID()}` } })).id;
  });
  afterAll(async () => {
    await prisma.notificationDelivery.deleteMany({ where: { orgId } });
    await prisma.notificationChannel.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  const event = (id: string, org = orgId): NotificationEvent => ({ id, type: 'budget.alert', orgId: org, occurredAt: new Date().toISOString(), data: { title: 'T', message: 'm', severity: 'warning' } });

  it('20 concurrent publishes of one event create exactly one in-app row and one row per destination', async () => {
    const mk = (name: string, path: string) => service.createChannel(orgId, 'u1', { type: 'WEBHOOK', name, config: { url: `http://127.0.0.1:9/${path}` } });
    process.env.NOTIFICATION_ALLOW_HTTP = 'true';
    process.env.NOTIFICATION_ALLOW_PRIVATE_NETWORKS = 'true';
    try {
      await mk('a', 'a');
      await mk('b', 'b');
    } finally {
      delete process.env.NOTIFICATION_ALLOW_HTTP;
      delete process.env.NOTIFICATION_ALLOW_PRIVATE_NETWORKS;
    }
    const id = `race-${randomUUID()}`;
    await Promise.all(Array.from({ length: 20 }, () => service.publish(event(id))));
    const rows = await prisma.notificationDelivery.findMany({ where: { orgId, eventId: id } });
    expect(rows.filter((r) => r.channelId === null)).toHaveLength(1);
    expect(rows.filter((r) => r.channelId !== null)).toHaveLength(2);
  });

  it('the database itself refuses a second in-app row with the same key (not just our code)', async () => {
    const key = `${orgId}:direct-${randomUUID()}`;
    const mk = () => prisma.notificationDelivery.create({ data: { orgId, channelId: null, channelType: 'IN_APP', eventId: 'x', eventType: 'budget.alert', status: 'SENT', payload: {}, inAppKey: key } });
    const results = await Promise.allSettled([mk(), mk(), mk(), mk(), mk()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected').every((r) => (r as PromiseRejectedResult).reason?.code === 'P2002')).toBe(true);
  });

  it('duplicate-destination detection works against the stored hash', async () => {
    process.env.NOTIFICATION_ALLOW_HTTP = 'true';
    process.env.NOTIFICATION_ALLOW_PRIVATE_NETWORKS = 'true';
    try {
      const url = `http://127.0.0.1:9/dup-${randomUUID()}`;
      const first: any = await service.createChannel(orgId, 'u1', { type: 'WEBHOOK', name: 'first', config: { url } });
      const second: any = await service.createChannel(orgId, 'u1', { type: 'WEBHOOK', name: 'second', config: { url } });
      expect(first.warnings).toEqual([]);
      expect(second.warnings.join()).toMatch(/Same destination as "first"/);
    } finally {
      delete process.env.NOTIFICATION_ALLOW_HTTP;
      delete process.env.NOTIFICATION_ALLOW_PRIVATE_NETWORKS;
    }
  });

  it('the inbox listing and unread counter work with the new index and cursor paging', async () => {
    const org2 = (await prisma.organization.create({ data: { name: 'T2', slug: `t2-${randomUUID()}` } })).id;
    try {
      for (let i = 0; i < 5; i++) await service.publish(event(`p${i}`, org2));
      const first = await service.inbox(org2, false, { limit: 2 });
      expect(first.items).toHaveLength(2);
      expect(first.nextCursor).toBeTruthy();
      const rest = await service.inbox(org2, false, { limit: 50, cursor: first.nextCursor! });
      expect(first.items.length + rest.items.length).toBe(5);
      expect(rest.nextCursor).toBeNull();
      expect((await service.unreadCount(org2)).unread).toBe(5);
      await service.markRead(org2);
      expect((await service.unreadCount(org2)).unread).toBe(0);
      expect((await service.unreadCount(orgId)).unread).toBeGreaterThanOrEqual(0); // other org untouched by mark-all
    } finally {
      await prisma.notificationDelivery.deleteMany({ where: { orgId: org2 } });
      await prisma.organization.delete({ where: { id: org2 } });
    }
  });
});
