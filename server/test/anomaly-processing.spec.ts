import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { AnomalyProcessor } from '../src/modules/anomaly/anomaly.processor';
import { AnomalyService } from '../src/modules/anomaly/anomaly.service';
import {
  anomalyAlertDedupKey,
  anomalyAlertTitle,
  anomalyAlertWindowSeconds,
  ANOMALY_CLAIM_LEASE_SECONDS,
  DETECT_ANOMALY_JOB,
  DETECT_ANOMALY_JOB_OPTS,
  SWEEP_ANOMALY_JOB,
  AnomalyJob,
} from '../src/modules/anomaly/anomaly.queue';
import { BudgetService } from '../src/modules/budget/budget.service';
import { RedisService } from '../src/modules/redis/redis.service';
import { FakeDb, FakeKv } from './helpers/fakes';

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

const MIN = 60_000;
const T0 = Date.parse('2026-11-24T10:00:00Z');

/** Everything wired to in-memory doubles; `clock` drives the DB, Redis and Date.now together. */
function setup(opts: { recordAlertFails?: () => boolean } = {}) {
  const db = new FakeDb();
  const kv = new FakeKv();
  let now = T0;
  db.now = () => now;
  const clock = {
    get now() {
      return now;
    },
    advance(ms: number) {
      now += ms;
      kv.now = now - T0;
    },
  };
  jest.spyOn(Date, 'now').mockImplementation(() => now);

  // A steady baseline of 30 evaluated requests before the test requests
  for (let i = 0; i < 30; i++) {
    db.addRequest({
      id: `hist-${i}`,
      costEstimate: 0.005 + (i % 3) * 0.001,
      totalTokens: 400 + i,
      anomalyStatus: 'CLEAR',
      createdAt: new Date(T0 - (40 - i) * MIN),
    });
  }

  const budget: any = {
    recordAlert: jest.fn(async (p: any) => {
      if (opts.recordAlertFails?.()) return false;
      db.alerts.push({ id: `alert-${db.alerts.length}`, projectId: p.projectId, thresholdType: p.thresholdType, title: p.title, triggeredAt: new Date(now) });
      return true;
    }),
  };
  const queue: any = { add: jest.fn(async () => ({})) };
  const processor = new AnomalyProcessor(db as any, kv as unknown as RedisService, new AnomalyService(), budget as BudgetService, queue);
  return { db, kv, budget, queue, processor, clock };
}

afterEach(() => jest.restoreAllMocks());

const spikeJob = (db: FakeDb, clock: { now: number }, extra: Partial<AnomalyJob> = {}): AnomalyJob => {
  const id = extra.requestId ?? `req_${randomUUID()}`;
  const createdAt = new Date(clock.now);
  db.addRequest({ id, costEstimate: 0.48, totalTokens: 28000, createdAt, ...(extra.projectId ? { projectId: extra.projectId } : {}), ...(extra.model ? { model: extra.model } : {}) });
  return { requestId: id, projectId: 'proj-a', model: 'gpt-4o', costEstimate: 0.48, totalTokens: 28000, createdAt: createdAt.toISOString(), ...extra };
};
const normalJob = (db: FakeDb, clock: { now: number }): AnomalyJob => {
  const id = `req_${randomUUID()}`;
  const createdAt = new Date(clock.now);
  db.addRequest({ id, costEstimate: 0.006, totalTokens: 450, createdAt });
  return { requestId: id, projectId: 'proj-a', model: 'gpt-4o', costEstimate: 0.006, totalTokens: 450, createdAt: createdAt.toISOString() };
};
const job = (data: AnomalyJob, attemptsMade = 0, name = DETECT_ANOMALY_JOB): any => ({ name, data, attemptsMade, opts: { attempts: DETECT_ANOMALY_JOB_OPTS.attempts } });
const status = (db: FakeDb, id: string) => db.requests.get(id)!.anomalyStatus;

describe('evaluation: PENDING → CLEAR | ANOMALY', () => {
  it('a normal request becomes CLEAR with an evaluation time, and raises nothing', async () => {
    const { db, processor, budget, clock } = setup();
    const j = normalJob(db, clock);
    expect(status(db, j.requestId)).toBe('PENDING');
    await processor.process(job(j));
    expect(status(db, j.requestId)).toBe('CLEAR');
    expect(db.requests.get(j.requestId)!.anomalyEvaluatedAt).toBeInstanceOf(Date);
    expect(db.requests.get(j.requestId)!.isAnomaly).toBe(false);
    expect(budget.recordAlert).not.toHaveBeenCalled();
  });

  it('a spike becomes ANOMALY (isAnomaly true, reason set) and raises one alert', async () => {
    const { db, processor, budget, clock } = setup();
    const j = spikeJob(db, clock);
    await processor.process(job(j));
    const row = db.requests.get(j.requestId)!;
    expect(row).toMatchObject({ anomalyStatus: 'ANOMALY', isAnomaly: true });
    expect(row.anomalyReason).toContain('Abnormal Cost Spike');
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
    expect(budget.recordAlert.mock.calls[0][0]).toMatchObject({ projectId: 'proj-a', thresholdType: 'ANOMALY_DETECTED', title: anomalyAlertTitle('gpt-4o') });
  });

  it('is scored only against requests BEFORE it (later traffic cannot hide a spike)', async () => {
    const { db, processor, clock } = setup();
    const j = spikeJob(db, clock);
    // a flood of equally expensive requests arrives afterwards
    for (let i = 0; i < 40; i++) db.addRequest({ id: `after-${i}`, costEstimate: 0.48, totalTokens: 28000, createdAt: new Date(clock.now + (i + 1) * 1000), anomalyStatus: 'CLEAR' });
    await processor.process(job(j));
    expect(status(db, j.requestId)).toBe('ANOMALY');
  });

  it('with no history the absolute thresholds still apply; blocked rows are never history', async () => {
    const { db, processor, clock } = setup();
    for (const r of db.requests.values()) r.isBlocked = true; // all history is blocked traffic
    const j = spikeJob(db, clock);
    await processor.process(job(j));
    expect(status(db, j.requestId)).toBe('ANOMALY');
  });
});

describe('duplicate processing', () => {
  it('replaying a finished job changes nothing and alerts nothing', async () => {
    const { db, processor, budget, clock } = setup();
    const j = spikeJob(db, clock);
    await processor.process(job(j));
    const writes = db.updateManyCalls;
    await processor.process(job(j));
    await processor.process(job(j, 3));
    expect(db.updateManyCalls).toBe(writes);
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
  });

  it('the same request delivered to 5 workers at once alerts once and ends ANOMALY', async () => {
    const { db, processor, budget, clock } = setup();
    const j = spikeJob(db, clock);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => processor.process(job(j))));
    // losers of the lease race retry later (they throw); none of them alerts
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
    expect(status(db, j.requestId)).toBe('ANOMALY');
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    // the retried losers then find a decided row and exit quietly
    for (let i = 0; i < 4; i++) await expect(processor.process(job(j, 1))).resolves.toBeUndefined();
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
  });
});

describe('alert deduplication window', () => {
  it('a burst of 25 spikes on one project+model produces ONE alert; every row is still marked ANOMALY', async () => {
    const { db, processor, budget, clock } = setup();
    const jobs = Array.from({ length: 25 }, () => spikeJob(db, clock));
    for (const j of jobs) await processor.process(job(j));
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
    expect(jobs.every((j) => status(db, j.requestId) === 'ANOMALY')).toBe(true);
  });

  it('is scoped per project AND per model', async () => {
    const { db, processor, budget, clock } = setup();
    await processor.process(job(spikeJob(db, clock)));
    await processor.process(job(spikeJob(db, clock, { model: 'claude-sonnet-5-5' })));
    await processor.process(job(spikeJob(db, clock, { projectId: 'proj-b' })));
    await processor.process(job(spikeJob(db, clock)));
    expect(budget.recordAlert).toHaveBeenCalledTimes(3);
  });

  it('claim EXPIRY: after the window a new spike alerts again, before it does not', async () => {
    const { db, processor, budget, clock } = setup();
    await processor.process(job(spikeJob(db, clock)));
    clock.advance(29 * MIN);
    await processor.process(job(spikeJob(db, clock)));
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
    clock.advance(2 * MIN);
    await processor.process(job(spikeJob(db, clock)));
    expect(budget.recordAlert).toHaveBeenCalledTimes(2);
  });

  it('Redis LOST the claim (flush / restart): the database record of the alert still suppresses a duplicate', async () => {
    const { db, kv, processor, budget, clock } = setup();
    await processor.process(job(spikeJob(db, clock)));
    kv.flush();
    clock.advance(5 * MIN);
    await processor.process(job(spikeJob(db, clock)));
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
    expect(db.alerts).toHaveLength(1);
  });

  it('the window is configurable and malformed values fall back to 30 minutes', () => {
    expect(anomalyAlertDedupKey('p', 'm')).toBe('spendguard:anomaly-alert:p:m');
    expect(anomalyAlertWindowSeconds()).toBe(1800);
    process.env.ANOMALY_ALERT_DEDUP_SECONDS = '60';
    expect(anomalyAlertWindowSeconds()).toBe(60);
    process.env.ANOMALY_ALERT_DEDUP_SECONDS = 'garbage';
    expect(anomalyAlertWindowSeconds()).toBe(1800);
  });
});

describe('worker crash and recovery', () => {
  it('crash AFTER the alert but BEFORE the row is marked: the replay completes the row and does NOT alert twice', async () => {
    const { db, processor, budget, clock } = setup();
    const j = spikeJob(db, clock);
    db.failUpdateManyTimes = 1; // the status write dies (process crash / connection lost)
    await expect(processor.process(job(j))).rejects.toThrow('db connection lost');
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
    expect(status(db, j.requestId)).toBe('PENDING'); // never "clear"

    await processor.process(job(j, 1));
    expect(status(db, j.requestId)).toBe('ANOMALY');
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
  });

  it('crash while holding the claim LEASE: a peer must retry (not silently drop the alert); after the lease expires it alerts', async () => {
    const { db, kv, processor, budget, clock } = setup();
    // a worker took the lease and died before recording anything
    await kv.acquireOnce(anomalyAlertDedupKey('proj-a', 'gpt-4o'), ANOMALY_CLAIM_LEASE_SECONDS, 'lease');
    const j = spikeJob(db, clock);

    await expect(processor.process(job(j))).rejects.toThrow('leased by another worker');
    expect(budget.recordAlert).not.toHaveBeenCalled();
    expect(status(db, j.requestId)).toBe('PENDING');

    clock.advance((ANOMALY_CLAIM_LEASE_SECONDS + 1) * 1000);
    await processor.process(job(j, 1));
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
    expect(status(db, j.requestId)).toBe('ANOMALY');
  });

  it('a failed alert write releases the lease so the retry can alert (the alert is not lost)', async () => {
    let failures = 1;
    const { db, processor, budget, clock } = setup({ recordAlertFails: () => failures-- > 0 });
    const j = spikeJob(db, clock);
    await expect(processor.process(job(j))).rejects.toThrow('could not be recorded');
    await processor.process(job(j, 1));
    expect(db.alerts).toHaveLength(1);
    expect(budget.recordAlert).toHaveBeenCalledTimes(2);
    expect(status(db, j.requestId)).toBe('ANOMALY');
  });

  it('alert claim store (Redis) down: the job is retried, it neither alerts nor drops the spike', async () => {
    const { db, kv, processor, budget, clock } = setup();
    kv.down = true;
    const j = spikeJob(db, clock);
    await expect(processor.process(job(j))).rejects.toThrow('claim store unavailable');
    expect(budget.recordAlert).not.toHaveBeenCalled();
    kv.down = false;
    await processor.process(job(j, 1));
    expect(status(db, j.requestId)).toBe('ANOMALY');
  });
});

describe('ledger row persisted late (its write is in the ledger retry queue)', () => {
  it('fails to retry until the row exists, alerts once, then completes', async () => {
    const { db, processor, budget, clock } = setup();
    const id = `req_${randomUUID()}`;
    const j: AnomalyJob = { requestId: id, projectId: 'proj-a', model: 'gpt-4o', costEstimate: 0.48, totalTokens: 28000, createdAt: new Date(clock.now).toISOString() };

    await expect(processor.process(job(j, 0))).rejects.toThrow('not persisted yet');
    await expect(processor.process(job(j, 1))).rejects.toThrow('not persisted yet');
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);

    db.addRequest({ id, costEstimate: 0.48, totalTokens: 28000, createdAt: new Date(j.createdAt) }); // the row finally lands, PENDING
    await processor.process(job(j, 2));
    expect(status(db, id)).toBe('ANOMALY');
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
  });

  it('a normal request whose row is missing also retries (it cannot be recorded CLEAR on a row that is not there)', async () => {
    const { processor, clock } = setup();
    const j: AnomalyJob = { requestId: 'req_missing', projectId: 'proj-a', model: 'gpt-4o', costEstimate: 0.006, totalTokens: 450, createdAt: new Date(clock.now).toISOString() };
    await expect(processor.process(job(j))).rejects.toThrow('not persisted yet');
  });
});

describe('retry exhaustion → FAILED (never mistaken for clear)', () => {
  it('after the last attempt the row is FAILED with a timestamp; with retries left it is untouched', async () => {
    const { db, processor, clock } = setup();
    const j = spikeJob(db, clock);
    await processor.onFailed(job(j, 2), new Error('boom'));
    expect(status(db, j.requestId)).toBe('PENDING');
    await processor.onFailed(job(j, DETECT_ANOMALY_JOB_OPTS.attempts), new Error('boom'));
    expect(status(db, j.requestId)).toBe('FAILED');
    expect(db.requests.get(j.requestId)!.anomalyEvaluatedAt).toBeInstanceOf(Date);
  });

  it('never overwrites a verdict, ignores sweep jobs, and never throws (even if the DB is down)', async () => {
    const { db, processor, clock } = setup();
    const j = normalJob(db, clock);
    await processor.process(job(j));
    await processor.onFailed(job(j, 6), new Error('late'));
    expect(status(db, j.requestId)).toBe('CLEAR');
    await expect(processor.onFailed(job({} as any, 6, SWEEP_ANOMALY_JOB), new Error('x'))).resolves.toBeUndefined();
    db.failUpdateManyTimes = 1;
    const k = spikeJob(db, clock);
    await expect(processor.onFailed(job(k, 6), new Error('x'))).resolves.toBeUndefined();
  });
});

describe('recovery sweep (durable, from Postgres)', () => {
  it('re-queues PENDING rows older than the minimum age, from the database row (no prompt data)', async () => {
    const { db, processor, queue, clock } = setup();
    const old = spikeJob(db, clock);
    clock.advance(3 * MIN);
    const fresh = spikeJob(db, clock); // 0 min old: still on its way through the normal queue
    const out = await processor.sweep();
    expect(out).toEqual({ requeued: 1, expired: 0 });
    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, payload, opts] = queue.add.mock.calls[0];
    expect(name).toBe(DETECT_ANOMALY_JOB);
    expect(payload).toEqual({ requestId: old.requestId, projectId: 'proj-a', model: 'gpt-4o', costEstimate: 0.48, totalTokens: 28000, createdAt: old.createdAt });
    expect(opts.jobId).toMatch(new RegExp(`^${old.requestId}-sweep-\\d+$`));
    expect(JSON.stringify(payload)).not.toContain(fresh.requestId);
  });

  it('ignores decided, blocked and too-recent rows', async () => {
    const { db, processor, queue, clock } = setup();
    db.addRequest({ id: 'blocked', isBlocked: true, anomalyStatus: 'SKIPPED', createdAt: new Date(clock.now - 10 * MIN) });
    db.addRequest({ id: 'done1', anomalyStatus: 'CLEAR', createdAt: new Date(clock.now - 10 * MIN) });
    db.addRequest({ id: 'done2', anomalyStatus: 'ANOMALY', createdAt: new Date(clock.now - 10 * MIN) });
    db.addRequest({ id: 'young', anomalyStatus: 'PENDING', createdAt: new Date(clock.now - 30_000) });
    expect(await processor.sweep()).toEqual({ requeued: 0, expired: 0 });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('a PENDING row older than the maximum age becomes FAILED (terminal) and is not re-queued', async () => {
    const { db, processor, queue, clock } = setup();
    db.addRequest({ id: 'ancient', anomalyStatus: 'PENDING', createdAt: new Date(clock.now - 25 * 60 * MIN) });
    const out = await processor.sweep();
    expect(out).toEqual({ requeued: 0, expired: 1 });
    expect(status(db, 'ancient')).toBe('FAILED');
    expect(queue.add).not.toHaveBeenCalled();
    // and it is not retried by later sweeps
    expect(await processor.sweep()).toEqual({ requeued: 0, expired: 0 });
  });

  it('FAILED rows are retried, but at most once per retry interval', async () => {
    const { db, processor, queue, clock } = setup();
    db.addRequest({ id: 'f1', anomalyStatus: 'FAILED', anomalyEvaluatedAt: new Date(clock.now - 10 * MIN), createdAt: new Date(clock.now - 20 * MIN) });
    expect((await processor.sweep()).requeued).toBe(0); // failed 10 min ago: too soon
    clock.advance(55 * MIN);
    expect((await processor.sweep()).requeued).toBe(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('respects the batch size and survives enqueue errors without throwing', async () => {
    process.env.ANOMALY_SWEEP_BATCH = '3';
    const { db, processor, queue, clock } = setup();
    for (let i = 0; i < 10; i++) db.addRequest({ id: `p${i}`, createdAt: new Date(clock.now - (30 - i) * MIN) });
    expect((await processor.sweep()).requeued).toBe(3);
    queue.add.mockRejectedValue(new Error('redis down'));
    await expect(processor.sweep()).resolves.toMatchObject({ requeued: 0 });
  });

  it('process() routes the repeatable sweep job to the sweep', async () => {
    const { db, processor, clock } = setup();
    db.addRequest({ id: 'p', createdAt: new Date(clock.now - 10 * MIN) });
    await expect(processor.process(job({} as any, 0, SWEEP_ANOMALY_JOB))).resolves.toEqual({ requeued: 1, expired: 0 });
  });
});

describe('end to end recovery scenarios (publish failure → sweep → worker)', () => {
  /** Runs every queued job through the processor, like a healthy worker would. */
  const drain = async (processor: AnomalyProcessor, queue: any) => {
    const jobs = queue.add.mock.calls.splice(0).map((c: any[]) => job(c[1]));
    for (const j of jobs) await processor.process(j);
    return jobs.length;
  };

  it('queue publish failed at request time: the row stays PENDING (not clear), the sweep re-queues it, the worker finishes it', async () => {
    const { db, processor, queue, budget, clock } = setup();
    const j = spikeJob(db, clock); // the gateway wrote the ledger row, then queue.add rejected: nothing queued
    expect(status(db, j.requestId)).toBe('PENDING');
    clock.advance(3 * MIN);
    await processor.sweep();
    expect(await drain(processor, queue)).toBe(1);
    expect(status(db, j.requestId)).toBe('ANOMALY');
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
  });

  it('Redis wiped (all queued jobs lost): one sweep recovers every pending request, each exactly once', async () => {
    const { db, processor, queue, budget, clock } = setup();
    const spikes = Array.from({ length: 4 }, () => spikeJob(db, clock));
    const normals = Array.from({ length: 6 }, () => normalJob(db, clock));
    clock.advance(5 * MIN);
    expect((await processor.sweep()).requeued).toBe(10);
    await drain(processor, queue);
    expect(spikes.every((s) => status(db, s.requestId) === 'ANOMALY')).toBe(true);
    expect(normals.every((n) => status(db, n.requestId) === 'CLEAR')).toBe(true);
    expect(budget.recordAlert).toHaveBeenCalledTimes(1); // one project+model window
    // a second sweep finds nothing left to do
    expect(await processor.sweep()).toEqual({ requeued: 0, expired: 0 });
  });

  it('exhausted retries → FAILED → recovered by a later sweep once the cause is gone', async () => {
    const { db, kv, processor, queue, clock } = setup();
    const j = spikeJob(db, clock);
    kv.down = true;
    await expect(processor.process(job(j, 5))).rejects.toThrow(); // last attempt fails
    await processor.onFailed(job(j, DETECT_ANOMALY_JOB_OPTS.attempts), new Error('claim store unavailable'));
    expect(status(db, j.requestId)).toBe('FAILED');

    kv.down = false;
    clock.advance(65 * MIN);
    expect((await processor.sweep()).requeued).toBe(1);
    await drain(processor, queue);
    expect(status(db, j.requestId)).toBe('ANOMALY');
  });
});

describe('monthly budget alert behaviour is preserved', () => {
  const makeBudget = (alreadyAlerted: boolean) => {
    const prisma: any = {
      project: { findUnique: jest.fn(async () => ({ id: 'p', name: 'Proj', budgetMonthly: 100, alertConfig: { warningThresholdPct: 80 } })) },
      budgetAlert: { findFirst: jest.fn(async () => (alreadyAlerted ? { id: 'a1' } : null)) },
    };
    const dispatch: any = { dispatch: jest.fn(async () => ({ status: 'IN_APP' })) };
    return { budget: new BudgetService(prisma, {} as any, dispatch), dispatch };
  };

  it('crossing 80% raises PERCENT_80 once per month; not again; not below the threshold or at the cap', async () => {
    const first = makeBudget(false);
    await first.budget.evaluatePostRequestThresholds('p', 85);
    expect(first.dispatch.dispatch.mock.calls[0][0]).toMatchObject({ thresholdType: 'PERCENT_80' });
    const repeat = makeBudget(true);
    await repeat.budget.evaluatePostRequestThresholds('p', 90);
    expect(repeat.dispatch.dispatch).not.toHaveBeenCalled();
    const below = makeBudget(false);
    await below.budget.evaluatePostRequestThresholds('p', 79.9);
    await below.budget.evaluatePostRequestThresholds('p', 100);
    expect(below.dispatch.dispatch).not.toHaveBeenCalled();
  });

  it('recordAlert never throws and reports failure as false (enforcement code ignores it)', async () => {
    const dispatch: any = { dispatch: jest.fn(async () => { throw new Error('queue down'); }) };
    const budget = new BudgetService({} as any, {} as any, dispatch);
    const a = { projectId: 'p', thresholdType: 'HARD_BLOCK' as const, thresholdValue: 1, title: 't', message: 'm' };
    await expect(budget.recordAlert(a)).resolves.toBe(false);
    dispatch.dispatch.mockResolvedValueOnce({ status: 'IN_APP' });
    await expect(budget.recordAlert(a)).resolves.toBe(true);
  });
});

// Real Redis: the claim must be atomic across truly concurrent workers
const PORT = process.env.TEST_REDIS_PORT ? Number(process.env.TEST_REDIS_PORT) : 0;
(PORT ? describe : describe.skip)('alert claim against real Redis', () => {
  it('10 concurrent workers, same project+model: exactly one alert; the losers retry instead of dropping; another model alerts separately', async () => {
    const redis = new RedisService({ get: (k: string) => ({ 'redis.host': process.env.TEST_REDIS_HOST || '127.0.0.1', 'redis.port': PORT }[k]) } as any);
    await redis.onModuleInit();
    for (let i = 0; i < 50 && !redis.isConnected; i++) await new Promise((r) => setTimeout(r, 50));
    const project = `anom-${randomUUID()}`;
    const db = new FakeDb();
    for (let i = 0; i < 30; i++) db.addRequest({ id: `h${i}`, projectId: project, costEstimate: 0.005 + (i % 3) * 0.001, anomalyStatus: 'CLEAR', createdAt: new Date(Date.now() - (40 - i) * MIN) });
    try {
      const budget: any = {
        recordAlert: jest.fn(async (p: any) => {
          db.alerts.push({ projectId: p.projectId, thresholdType: p.thresholdType, title: p.title, triggeredAt: new Date() });
          return true;
        }),
      };
      const processor = new AnomalyProcessor(db as any, redis, new AnomalyService(), budget, { add: jest.fn() } as any);
      const mk = (model = 'gpt-4o') => {
        const id = `req_${randomUUID()}`;
        db.addRequest({ id, projectId: project, model, costEstimate: 0.48, totalTokens: 28000, createdAt: new Date() });
        return { requestId: id, projectId: project, model, costEstimate: 0.48, totalTokens: 28000, createdAt: new Date().toISOString() };
      };
      const burst = Array.from({ length: 10 }, () => mk());
      await Promise.allSettled(burst.map((j) => processor.process(job(j))));
      expect(budget.recordAlert).toHaveBeenCalledTimes(1);
      // retried losers now find the confirmed claim and finish without alerting
      await Promise.all(burst.map((j) => processor.process(job(j, 1))));
      expect(budget.recordAlert).toHaveBeenCalledTimes(1);
      expect(burst.every((j) => status(db, j.requestId) === 'ANOMALY')).toBe(true);

      // The burst is now part of the baseline (the detector adapts); remove it to test the other model on a clean baseline
      burst.forEach((j) => db.requests.delete(j.requestId));
      await processor.process(job(mk('claude-sonnet-5-5')));
      expect(budget.recordAlert).toHaveBeenCalledTimes(2);
    } finally {
      await redis.delCache(anomalyAlertDedupKey(project, 'gpt-4o'));
      await redis.delCache(anomalyAlertDedupKey(project, 'claude-sonnet-5-5'));
      await redis.onModuleDestroy();
    }
  });
});
