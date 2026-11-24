import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { Queue, Worker, Job, UnrecoverableError } from 'bullmq';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { NotificationDeliveryProcessor } from '../src/modules/notifications/notification-delivery.processor';
import { DELIVER_JOB, NotificationEvent } from '../src/modules/notifications/notification.events';
import { FakeNotificationDb, fakeEncryption } from './helpers/notification-fakes';
import { fakeTransport } from './helpers/fake-transport';

/**
 * Notification delivery on a REAL BullMQ + Redis. The database row is the durable record; the queue is a delivery
 * mechanism that may lose jobs. Gated on TEST_REDIS_PORT (a THROWAWAY Redis). Queue names are unique per test.
 *
 * Delivery states: QUEUED (pending) -> RETRYING -> SENT (delivered) | FAILED. "Paused" is a channel state (enabled=false),
 * shown on the channel; a delivery for a paused channel fails with an explicit reason and can be retried after resume.
 */
const PORT = process.env.TEST_REDIS_PORT ? Number(process.env.TEST_REDIS_PORT) : 0;
const HOST = process.env.TEST_REDIS_HOST || '127.0.0.1';
const withRedis = PORT ? describe : describe.skip;
if (!PORT) console.warn('[notification-queue.spec] TEST_REDIS_PORT not set: the real-BullMQ suite is SKIPPED');

const connection = { host: HOST, port: PORT, maxRetriesPerRequest: null as null };
const URL = 'https://93.184.216.34/hook';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean | Promise<boolean>, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(40);
  }
  return false;
};

withRedis('notification delivery on real BullMQ', () => {
  const closers: Array<{ close: (force?: boolean) => Promise<void> }> = [];
  let name: string;
  let queue: Queue;
  let db: FakeNotificationDb;
  let service: NotificationsService;
  let processor: NotificationDeliveryProcessor;
  let enc: ReturnType<typeof fakeEncryption>;
  const evt = (id: string = randomUUID()): NotificationEvent => ({ id, type: 'budget.alert', orgId: 'org-a', occurredAt: new Date().toISOString(), data: { title: 'T', message: 'm', severity: 'warning' } });

  beforeEach(async () => {
    name = `notif-test-${randomUUID()}`;
    queue = new Queue(name, { connection });
    closers.push(queue);
    db = new FakeNotificationDb();
    enc = fakeEncryption();
    // Same queue, but with fast retries so the test does not wait 10 s per attempt
    const fast: any = { add: (n: string, d: any, o: any) => queue.add(n, d, { ...o, attempts: 3, backoff: { type: 'fixed', delay: 60 } }) };
    service = new NotificationsService(db as any, enc as any, fast);
    processor = new NotificationDeliveryProcessor(db as any, enc as any, { sendNotification: async () => true } as any, service);
    jest.spyOn(require('dns/promises'), 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    for (const c of closers.splice(0).reverse()) await c.close(true).catch(() => undefined);
    const q = new Queue(name, { connection });
    await q.obliterate({ force: true }).catch(() => undefined);
    await q.close();
  });

  const channel = () => service.createChannel('org-a', 'u1', { type: 'WEBHOOK', name: 'w', config: { url: URL } }) as Promise<any>;
  const worker = (opts: Partial<ConstructorParameters<typeof Worker>[2]> = {}) => {
    const w = new Worker(name, (job: Job) => processor.process(job as any) as Promise<unknown>, { connection, ...opts });
    w.on('failed', (job, err) => void processor.onFailed(job as any, err));
    closers.push(w);
    return w;
  };
  const deliveryOf = (chId: string) => db.deliveries.find((d) => d.channelId === chId)!;

  it('a delivery is sent once even when the same job is enqueued many times (job id collapses duplicates)', async () => {
    const ch = await channel();
    const t = fakeTransport(200);
    processor.requestImpl = t.impl;
    await service.publish(evt('e1'));
    const d = deliveryOf(ch.id);
    await Promise.all([service.enqueue(d.id), service.enqueue(d.id), service.enqueue(d.id)]);
    worker();
    expect(await until(() => d.status === 'SENT')).toBe(true);
    await sleep(300);
    expect(t.calls).toHaveLength(1);
  });

  it('TWO sweeps racing (overlapping schedulers / concurrent recovery workers) produce ONE active job per delivery', async () => {
    const ch = await channel();
    await service.publish(evt('e1'));
    const d = deliveryOf(ch.id);
    d.createdAt = new Date(Date.now() - 10 * 60_000);
    await queue.obliterate({ force: true }); // the original job is gone
    const [a, b] = await Promise.all([service.requeueStale(), service.requeueStale()]);
    expect(a + b).toBeGreaterThanOrEqual(1);
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed');
    expect(counts.waiting + counts.active + counts.delayed).toBe(1);
  });

  it('WORKER CRASH mid-delivery: the stalled job is picked up by another worker and the delivery is finished exactly once', async () => {
    const ch = await channel();
    const t = fakeTransport(200);
    processor.requestImpl = t.impl;
    await service.publish(evt('e1'));
    const d = deliveryOf(ch.id);

    let started!: () => void;
    const hasStarted = new Promise<void>((r) => (started = r));
    const crashing = new Worker(name, async () => { started(); await new Promise(() => undefined); }, { connection, lockDuration: 1000, stalledInterval: 400, maxStalledCount: 3 });
    closers.push(crashing);
    await hasStarted;
    await crashing.close(true); // dies holding the job: no completion, no lock release
    worker({ lockDuration: 1000, stalledInterval: 400, maxStalledCount: 3 });
    expect(await until(() => d.status === 'SENT', 30000)).toBe(true);
    expect(t.calls).toHaveLength(1);
  });

  it('PERMANENT failure (404) stops retrying immediately: one attempt, FAILED, the reason is kept and the job stays inspectable', async () => {
    const ch = await channel();
    const t = fakeTransport(404);
    processor.requestImpl = t.impl;
    await service.publish(evt('e1'));
    const d = deliveryOf(ch.id);
    worker();
    expect(await until(() => d.status === 'FAILED')).toBe(true);
    await sleep(400); // long enough for any (wrong) retry to have happened
    expect(t.calls).toHaveLength(1);
    expect(d).toMatchObject({ attempts: 1, lastError: expect.stringMatching(/HTTP 404/) });
    const failed = await queue.getJobs(['failed']);
    expect(failed).toHaveLength(1); // kept for inspection, not discarded
  });

  it('TRANSIENT failures are retried a bounded number of times, then FAILED (never unlimited sends)', async () => {
    const ch = await channel();
    const t = fakeTransport(500);
    processor.requestImpl = t.impl;
    await service.publish(evt('e1'));
    const d = deliveryOf(ch.id);
    worker();
    expect(await until(() => d.status === 'FAILED')).toBe(true);
    await sleep(500);
    expect(t.calls).toHaveLength(3); // attempts: 3 in this test configuration
    expect(d.attempts).toBe(3);
  });

  it('a failure then recovery: RETRYING is visible between attempts and the delivery ends SENT with the attempt count', async () => {
    const ch = await channel();
    let n = 0;
    const flaky: any = (options: any, cb: any) => (n++ === 0 ? fakeTransport(503).impl(options, cb) : fakeTransport(200).impl(options, cb));
    processor.requestImpl = flaky;
    await service.publish(evt('e1'));
    const d = deliveryOf(ch.id);
    worker();
    expect(await until(() => d.status === 'SENT')).toBe(true);
    expect(d.attempts).toBe(2);
    expect(d.lastError).toBeNull();
  });

  it('REDIS LOST EVERY QUEUED JOB: the sweep rebuilds the work from the delivery rows and everything is delivered once', async () => {
    const ch = await channel();
    const t = fakeTransport(200);
    processor.requestImpl = t.impl;
    for (let i = 0; i < 5; i++) await service.publish(evt(`e${i}`));
    await queue.obliterate({ force: true });
    expect(db.deliveries.filter((d) => d.channelId === ch.id && d.status === 'QUEUED')).toHaveLength(5);
    db.deliveries.forEach((d) => (d.createdAt = new Date(Date.now() - 10 * 60_000)));
    expect(await service.requeueStale()).toBe(5);
    worker();
    expect(await until(() => db.deliveries.filter((d) => d.channelId === ch.id).every((d) => d.status === 'SENT'))).toBe(true);
    expect(t.calls).toHaveLength(5);
  });

  it('a delivery whose channel was paused before sending FAILS with a clear reason (no retries), and works after resume + manual retry', async () => {
    const ch = await channel();
    const t = fakeTransport(200);
    processor.requestImpl = t.impl;
    await service.publish(evt('e1'));
    const d = deliveryOf(ch.id);
    await service.updateChannel('org-a', ch.id, { enabled: false }, 'u1');
    worker();
    expect(await until(() => d.status === 'FAILED')).toBe(true);
    expect(d.lastError).toMatch(/deleted or disabled/);
    expect(t.calls).toHaveLength(0);
    await service.updateChannel('org-a', ch.id, { enabled: true }, 'u1');
    await service.retryDelivery('org-a', d.id);
    expect(await until(() => d.status === 'SENT')).toBe(true);
    expect(t.calls).toHaveLength(1);
  });

  it('an UnrecoverableError from the processor is not retried by BullMQ', async () => {
    let calls = 0;
    const w = new Worker(name, async () => { calls++; throw new UnrecoverableError('never retry'); }, { connection });
    closers.push(w);
    await queue.add(DELIVER_JOB, { deliveryId: 'x' }, { attempts: 5, backoff: { type: 'fixed', delay: 20 } });
    await sleep(600);
    expect(calls).toBe(1);
  });
});
