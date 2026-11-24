import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Queue, Worker, Job } from 'bullmq';
import { AnomalyProcessor } from '../src/modules/anomaly/anomaly.processor';
import { AnomalyService } from '../src/modules/anomaly/anomaly.service';
import { DETECT_ANOMALY_JOB, DETECT_ANOMALY_JOB_OPTS, AnomalyJob } from '../src/modules/anomaly/anomaly.queue';
import { RedisService } from '../src/modules/redis/redis.service';
import { FakeDb, FakeKv } from './helpers/fakes';

/**
 * These run a REAL BullMQ queue and workers against a real Redis, because "the anomaly queue is
 * durable" is a claim about BullMQ + Redis, not about our mocks. Gated like budget-redis.spec.ts:
 * they need TEST_REDIS_PORT pointing at a THROWAWAY Redis. Queue names are unique per run.
 */
const PORT = process.env.TEST_REDIS_PORT ? Number(process.env.TEST_REDIS_PORT) : 0;
const HOST = process.env.TEST_REDIS_HOST || '127.0.0.1';
const withRedis = PORT ? describe : describe.skip;
if (!PORT) console.warn('[anomaly-recovery.spec] TEST_REDIS_PORT not set: the real-BullMQ suites are SKIPPED');

const MIN = 60_000;

describe('Redis persistence configuration (what the queue durability actually rests on)', () => {
  it('docker-compose runs Redis with AOF (--appendonly yes); without it a Redis restart loses every queued job', () => {
    const compose = readFileSync(join(__dirname, '..', '..', 'docker-compose.yml'), 'utf8');
    expect(compose).toMatch(/redis-server["',\s]+--appendonly["',\s]+yes/);
  });

  it('documents that AOF everysec is NOT zero-loss: the DB-backed sweep, not the queue, is the guarantee', () => {
    const queueSource = readFileSync(join(__dirname, '..', 'src', 'modules', 'anomaly', 'anomaly.queue.ts'), 'utf8');
    expect(queueSource).toContain('source of');
    expect(queueSource).toMatch(/up to ~1 s of queued jobs can\s+\*?\s*be lost/);
  });
});

withRedis('anomaly queue against real BullMQ + Redis', () => {
  const connection = { host: HOST, port: PORT, maxRetriesPerRequest: null as null };
  const created: Array<{ close: (force?: boolean) => Promise<void> }> = [];
  let name: string;
  let queue: Queue;
  let db: FakeDb;

  const spike = (): AnomalyJob => {
    const id = `req_${randomUUID()}`;
    const createdAt = new Date();
    db.addRequest({ id, costEstimate: 0.48, totalTokens: 28000, createdAt });
    return { requestId: id, projectId: 'proj-a', model: 'gpt-4o', costEstimate: 0.48, totalTokens: 28000, createdAt: createdAt.toISOString() };
  };

  const makeProcessor = () => {
    const budget: any = {
      recordAlert: jest.fn(async (p: any) => {
        db.alerts.push({ projectId: p.projectId, thresholdType: p.thresholdType, title: p.title, triggeredAt: new Date() });
        return true;
      }),
    };
    return { processor: new AnomalyProcessor(db as any, new FakeKv() as unknown as RedisService, new AnomalyService(), budget, queue), budget };
  };

  const fastWorker = (fn: (job: Job) => Promise<unknown>) => {
    // Short lock + frequent stalled checks so a dead worker is detected in about a second
    const w = new Worker(name, fn, { connection, lockDuration: 1000, stalledInterval: 400, maxStalledCount: 3 });
    created.push(w);
    return w;
  };
  const waitFor = (w: Worker, event: 'completed' | 'active', ms = 45000) =>
    new Promise<Job>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
      w.once(event as any, (job: Job) => {
        clearTimeout(t);
        resolve(job);
      });
    });

  beforeEach(() => {
    name = `anomaly-test-${randomUUID()}`;
    db = new FakeDb();
    for (let i = 0; i < 30; i++) {
      db.addRequest({ id: `h${i}`, costEstimate: 0.005 + (i % 3) * 0.001, totalTokens: 400 + i, anomalyStatus: 'CLEAR', createdAt: new Date(Date.now() - (60 - i) * MIN) });
    }
    queue = new Queue(name, { connection });
    created.push(queue);
  });

  afterEach(async () => {
    for (const c of created.splice(0).reverse()) await c.close(true).catch(() => undefined);
    // Remove only this test's queue keys
    const q = new Queue(name, { connection });
    await q.obliterate({ force: true }).catch(() => undefined);
    await q.close();
  });

  it('WORKER CRASH mid-job: the job is detected as stalled, picked up by another worker, and finished exactly once', async () => {
    const j = spike();
    const { processor, budget } = makeProcessor();

    let started!: () => void;
    const hasStarted = new Promise<void>((r) => (started = r));
    const crashing = fastWorker(async () => {
      started();
      await new Promise(() => undefined); // never finishes: the process "dies" here
    });
    await queue.add(DETECT_ANOMALY_JOB, j, { ...DETECT_ANOMALY_JOB_OPTS, jobId: j.requestId });
    await hasStarted;
    await crashing.close(true); // no completion, no lock release: exactly what a crashed process leaves behind

    const survivor = fastWorker((job) => processor.process(job as any) as Promise<unknown>);
    await waitFor(survivor, 'completed');

    expect(db.requests.get(j.requestId)!.anomalyStatus).toBe('ANOMALY');
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
    const counts = await queue.getJobCounts('active', 'waiting', 'failed', 'completed');
    expect(counts).toMatchObject({ active: 0, waiting: 0, failed: 0, completed: 1 });
  });

  it('DUPLICATE publish of the same request id is collapsed by BullMQ (one job); a replay with a new job id is a no-op for the evaluator', async () => {
    const j = spike();
    await queue.add(DETECT_ANOMALY_JOB, j, { ...DETECT_ANOMALY_JOB_OPTS, jobId: j.requestId });
    await queue.add(DETECT_ANOMALY_JOB, j, { ...DETECT_ANOMALY_JOB_OPTS, jobId: j.requestId });
    expect((await queue.getJobCounts('waiting')).waiting).toBe(1);

    const { processor, budget } = makeProcessor();
    const w = fastWorker((job) => processor.process(job as any) as Promise<unknown>);
    await waitFor(w, 'completed');
    // a sweep-style replay under a different job id
    await queue.add(DETECT_ANOMALY_JOB, j, { ...DETECT_ANOMALY_JOB_OPTS, jobId: `${j.requestId}-sweep-1` });
    await waitFor(w, 'completed');
    expect(budget.recordAlert).toHaveBeenCalledTimes(1);
    expect(db.requests.get(j.requestId)!.anomalyStatus).toBe('ANOMALY');
  });

  it('REDIS LOST EVERY QUEUED JOB (restart without persistence): the sweep rebuilds the work from Postgres and nothing stays PENDING', async () => {
    const jobs = [spike(), spike(), spike()];
    for (const j of jobs) await queue.add(DETECT_ANOMALY_JOB, j, { ...DETECT_ANOMALY_JOB_OPTS, jobId: j.requestId });
    await queue.obliterate({ force: true }); // the jobs are gone from Redis; the rows are still PENDING in the database
    expect((await queue.getJobCounts('waiting')).waiting).toBe(0);
    expect(jobs.every((j) => db.requests.get(j.requestId)!.anomalyStatus === 'PENDING')).toBe(true);

    process.env.ANOMALY_SWEEP_MIN_AGE_MS = '1';
    try {
      await new Promise((r) => setTimeout(r, 20));
      const { processor, budget } = makeProcessor();
      const out = await processor.sweep();
      expect(out.requeued).toBe(3);

      let done = 0;
      const w = fastWorker(async (job) => {
        const res = await processor.process(job as any);
        done++;
        return res;
      });
      const finished = new Promise<void>((resolve) => w.on('completed', () => done >= 3 && resolve()));
      await Promise.race([finished, new Promise((_, rej) => setTimeout(() => rej(new Error('sweep jobs not processed')), 45000))]);
      expect(jobs.every((j) => db.requests.get(j.requestId)!.anomalyStatus === 'ANOMALY')).toBe(true);
      expect(budget.recordAlert).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env.ANOMALY_SWEEP_MIN_AGE_MS;
    }
  });

  it('RETRY EXHAUSTION on a real queue: after the last attempt the row is FAILED (visible), not PENDING and not clear', async () => {
    const j = spike();
    const { processor } = makeProcessor();
    const w = fastWorker(async () => {
      throw new Error('downstream unavailable');
    });
    w.on('failed', (job, err) => {
      void processor.onFailed(job as any, err);
    });
    const failed = new Promise<void>((resolve) => w.on('failed', (job) => job && job.attemptsMade >= 2 && resolve()));
    await queue.add(DETECT_ANOMALY_JOB, j, { attempts: 2, backoff: { type: 'fixed', delay: 50 }, jobId: j.requestId });
    await Promise.race([failed, new Promise((_, rej) => setTimeout(() => rej(new Error('job never failed')), 45000))]);
    await new Promise((r) => setTimeout(r, 500)); // let the async onFailed write land
    expect(db.requests.get(j.requestId)!.anomalyStatus).toBe('FAILED');
  });
});
