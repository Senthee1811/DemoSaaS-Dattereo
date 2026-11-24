import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { AnomalyProcessor } from '../src/modules/anomaly/anomaly.processor';
import { AnomalyService } from '../src/modules/anomaly/anomaly.service';
import { anomalyAlertDedupKey, anomalyAlertWindowSeconds, DETECT_ANOMALY_JOB_OPTS, AnomalyJob } from '../src/modules/anomaly/anomaly.queue';
import { BudgetService } from '../src/modules/budget/budget.service';
import { RedisService } from '../src/modules/redis/redis.service';

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

/** A tiny in-memory stand-in for Redis SET NX EX with a controllable clock. */
class FakeNxStore {
  private store = new Map<string, number>();
  now = 0;
  down = false;
  acquireOnce = jest.fn(async (key: string, ttlSeconds: number): Promise<boolean | null> => {
    if (this.down) return null;
    const exp = this.store.get(key);
    if (exp !== undefined && exp > this.now) return false;
    this.store.set(key, this.now + ttlSeconds * 1000);
    return true;
  });
  delCache = jest.fn(async (key: string) => {
    this.store.delete(key);
  });
}

// A steady baseline, then a spike
const baseline = Array.from({ length: 30 }, (_, i) => ({ costEstimate: 0.005 + (i % 3) * 0.001, totalTokens: 400 + i }));

function makeProcessor(opts: { history?: any[]; flaggedCount?: number; recordAlert?: () => Promise<boolean>; store?: FakeNxStore } = {}) {
  const store = opts.store ?? new FakeNxStore();
  const prisma: any = {
    request: {
      findMany: jest.fn(async () => opts.history ?? baseline),
      updateMany: jest.fn(async () => ({ count: opts.flaggedCount ?? 1 })),
    },
  };
  const budget: any = { recordAlert: jest.fn(opts.recordAlert ?? (async () => true)) };
  const processor = new AnomalyProcessor(prisma, store as unknown as RedisService, new AnomalyService(), budget as unknown as BudgetService);
  return { processor, prisma, budget, store };
}

const spike = (extra: Partial<AnomalyJob> = {}): AnomalyJob => ({
  requestId: `req_${randomUUID()}`,
  projectId: 'proj-a',
  model: 'gpt-4o',
  costEstimate: 0.48,
  totalTokens: 28000,
  createdAt: new Date().toISOString(),
  ...extra,
});
const normal = (extra: Partial<AnomalyJob> = {}): AnomalyJob => spike({ costEstimate: 0.006, totalTokens: 450, ...extra });
const job = (data: AnomalyJob, attemptsMade = 0): any => ({ data, attemptsMade, opts: { attempts: DETECT_ANOMALY_JOB_OPTS.attempts } });

describe('anomaly detection happens in a worker, scored against prior history', () => {
  it('reads the 40 most recent non-blocked rows strictly BEFORE the request (excluding itself)', async () => {
    const { processor, prisma } = makeProcessor();
    const j = spike();
    await processor.process(job(j));
    const arg = prisma.request.findMany.mock.calls[0][0];
    expect(arg.take).toBe(40);
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    expect(arg.where).toMatchObject({ projectId: 'proj-a', isBlocked: false, id: { not: j.requestId }, createdAt: { lt: new Date(j.createdAt) } });
  });

  it('a normal request does nothing: no flag, no alert, no dedupe claim', async () => {
    const { processor, prisma, budget, store } = makeProcessor();
    await processor.process(job(normal()));
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
    expect(budget.recordAlert).not.toHaveBeenCalled();
    expect(store.acquireOnce).not.toHaveBeenCalled();
  });

  it('a spike flags the ledger row and raises one ANOMALY_DETECTED alert', async () => {
    const { processor, prisma, budget } = makeProcessor();
    const j = spike();
    await processor.process(job(j));
    expect(prisma.request.updateMany).toHaveBeenCalledWith({
      where: { id: j.requestId },
      data: { isAnomaly: true, anomalyReason: expect.stringContaining('Abnormal Cost Spike') },
    });
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
    expect(budget.recordAlert.mock.calls[0][0]).toMatchObject({ projectId: 'proj-a', thresholdType: 'ANOMALY_DETECTED', title: expect.stringContaining('gpt-4o') });
  });

  it('too little history falls back to the absolute thresholds (existing detector behaviour is unchanged)', async () => {
    const { processor, budget } = makeProcessor({ history: [] });
    await processor.process(job(spike()));
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
    const quiet = makeProcessor({ history: [] });
    await quiet.processor.process(job(normal()));
    expect(quiet.budget.recordAlert).not.toHaveBeenCalled();
  });
});

describe('anomaly alert deduplication', () => {
  it('a burst of 25 spikes on one project+model produces ONE alert, but every row is still flagged', async () => {
    const { processor, prisma, budget } = makeProcessor();
    for (let i = 0; i < 25; i++) await processor.process(job(spike()));
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
    expect(prisma.request.updateMany).toHaveBeenCalledTimes(25);
  });

  it('is scoped per project AND per model: a different model or project alerts independently', async () => {
    const { processor, budget } = makeProcessor();
    await processor.process(job(spike({ model: 'gpt-4o' })));
    await processor.process(job(spike({ model: 'claude-sonnet-5-5' })));
    await processor.process(job(spike({ projectId: 'proj-b', model: 'gpt-4o' })));
    await processor.process(job(spike({ model: 'gpt-4o' }))); // duplicate of the first
    expect(budget.recordAlert).toHaveBeenCalledTimes(3);
    const titles = budget.recordAlert.mock.calls.map((c: any[]) => `${c[0].projectId}:${c[0].title}`);
    expect(new Set(titles).size).toBe(3);
  });

  it('the dedupe key is project + model, and the default window is 30 minutes (configurable)', () => {
    expect(anomalyAlertDedupKey('proj-a', 'gpt-4o')).toBe('spendguard:anomaly-alert:proj-a:gpt-4o');
    expect(anomalyAlertWindowSeconds()).toBe(1800);
    process.env.ANOMALY_ALERT_DEDUP_SECONDS = '60';
    expect(anomalyAlertWindowSeconds()).toBe(60);
    process.env.ANOMALY_ALERT_DEDUP_SECONDS = 'garbage';
    expect(anomalyAlertWindowSeconds()).toBe(1800);
  });

  it('alerts again once the window has passed', async () => {
    const store = new FakeNxStore();
    const { processor, budget } = makeProcessor({ store });
    await processor.process(job(spike()));
    store.now += 29 * 60 * 1000;
    await processor.process(job(spike()));
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
    store.now += 2 * 60 * 1000; // 31 minutes after the first
    await processor.process(job(spike()));
    expect(budget.recordAlert).toHaveBeenCalledTimes(2);
  });

  it('concurrent workers cannot both alert (the claim is atomic)', async () => {
    const { processor, budget } = makeProcessor();
    await Promise.all(Array.from({ length: 10 }, () => processor.process(job(spike()))));
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
  });

  it('if the alert could not be recorded, the claim is released and the job retries (the alert is not lost)', async () => {
    let n = 0;
    const store = new FakeNxStore();
    const { processor, budget } = makeProcessor({ store, recordAlert: async () => ++n > 1 });
    await expect(processor.process(job(spike()))).rejects.toThrow('could not be recorded');
    expect(store.delCache).toHaveBeenCalledWith(anomalyAlertDedupKey('proj-a', 'gpt-4o'));
    await processor.process(job(spike(), 1)); // retry succeeds
    expect(budget.recordAlert).toHaveBeenCalledTimes(2);
    // and now the window is held, so a third spike is suppressed
    await processor.process(job(spike()));
    expect(budget.recordAlert).toHaveBeenCalledTimes(2);
  });

  it('dedupe store (Redis) down: the job fails to be retried later; it neither alerts nor floods', async () => {
    const store = new FakeNxStore();
    store.down = true;
    const { processor, budget } = makeProcessor({ store });
    await expect(processor.process(job(spike()))).rejects.toThrow('dedupe store unavailable');
    expect(budget.recordAlert).not.toHaveBeenCalled();
  });
});

describe('ledger row not persisted yet (its write is in the retry queue)', () => {
  it('the alert is raised once, the job fails to retry the flag, and the retry does not alert again', async () => {
    const { processor, prisma, budget } = makeProcessor({ flaggedCount: 0 });
    const j = spike();
    await expect(processor.process(job(j, 0))).rejects.toThrow('not persisted yet');
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
    await expect(processor.process(job(j, 1))).rejects.toThrow('not persisted yet');
    expect(budget.recordAlert).toHaveBeenCalledTimes(1); // suppressed by dedupe
    expect(prisma.request.updateMany).toHaveBeenCalledTimes(2);
  });

  it('on the final attempt it stops retrying instead of failing forever', async () => {
    const { processor } = makeProcessor({ flaggedCount: 0 });
    await expect(processor.process(job(spike(), DETECT_ANOMALY_JOB_OPTS.attempts - 1))).resolves.toBeUndefined();
  });
});

describe('monthly budget alert behaviour is preserved', () => {
  const makeBudget = (spendAlreadyAlerted: boolean) => {
    const prisma: any = {
      project: {
        findUnique: jest.fn(async () => ({ id: 'p', name: 'Proj', budgetMonthly: 100, alertConfig: { warningThresholdPct: 80 } })),
      },
      budgetAlert: { findFirst: jest.fn(async () => (spendAlreadyAlerted ? { id: 'a1' } : null)) },
    };
    const dispatch: any = { dispatch: jest.fn(async () => ({ status: 'IN_APP' })) };
    return { budget: new BudgetService(prisma, {} as any, dispatch), dispatch };
  };

  it('crossing 80% raises PERCENT_80 once per month; not again if already raised; not below the threshold or at the cap', async () => {
    const first = makeBudget(false);
    await first.budget.evaluatePostRequestThresholds('p', 85);
    expect(first.dispatch.dispatch).toHaveBeenCalledTimes(1);
    expect(first.dispatch.dispatch.mock.calls[0][0]).toMatchObject({ thresholdType: 'PERCENT_80' });

    const repeat = makeBudget(true);
    await repeat.budget.evaluatePostRequestThresholds('p', 90);
    expect(repeat.dispatch.dispatch).not.toHaveBeenCalled();

    const below = makeBudget(false);
    await below.budget.evaluatePostRequestThresholds('p', 79.9);
    await below.budget.evaluatePostRequestThresholds('p', 100); // at the cap is HARD_BLOCK territory
    expect(below.dispatch.dispatch).not.toHaveBeenCalled();
  });

  it('recordAlert never throws and reports failure as false (enforcement code ignores it)', async () => {
    const prisma: any = {};
    const dispatch: any = { dispatch: jest.fn(async () => { throw new Error('queue down'); }) };
    const budget = new BudgetService(prisma, {} as any, dispatch);
    await expect(budget.recordAlert({ projectId: 'p', thresholdType: 'HARD_BLOCK', thresholdValue: 1, title: 't', message: 'm' })).resolves.toBe(false);
    dispatch.dispatch.mockResolvedValueOnce({ status: 'IN_APP' });
    await expect(budget.recordAlert({ projectId: 'p', thresholdType: 'HARD_BLOCK', thresholdValue: 1, title: 't', message: 'm' })).resolves.toBe(true);
  });
});

// Real Redis: the claim must be atomic across truly concurrent workers
const PORT = process.env.TEST_REDIS_PORT ? Number(process.env.TEST_REDIS_PORT) : 0;
(PORT ? describe : describe.skip)('alert dedupe against real Redis', () => {
  it('10 concurrent workers, same project+model: one alert; another model alerts separately', async () => {
    const redis = new RedisService({ get: (k: string) => ({ 'redis.host': process.env.TEST_REDIS_HOST || '127.0.0.1', 'redis.port': PORT }[k]) } as any);
    await redis.onModuleInit();
    for (let i = 0; i < 50 && !redis.isConnected; i++) await new Promise((r) => setTimeout(r, 50));
    const project = `anom-${randomUUID()}`;
    try {
      const budget: any = { recordAlert: jest.fn(async () => true) };
      const prisma: any = { request: { findMany: async () => baseline, updateMany: async () => ({ count: 1 }) } };
      const processor = new AnomalyProcessor(prisma, redis, new AnomalyService(), budget);
      await Promise.all(Array.from({ length: 10 }, () => processor.process(job(spike({ projectId: project })))));
      expect(budget.recordAlert).toHaveBeenCalledTimes(1);
      await processor.process(job(spike({ projectId: project, model: 'claude-sonnet-5-5' })));
      expect(budget.recordAlert).toHaveBeenCalledTimes(2);
    } finally {
      await redis.delCache(anomalyAlertDedupKey(project, 'gpt-4o'));
      await redis.delCache(anomalyAlertDedupKey(project, 'claude-sonnet-5-5'));
      await redis.onModuleDestroy();
    }
  });
});
