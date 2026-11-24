/** BullMQ queue that scores each completed request for a spend spike, off the request path. */
export const ANOMALY_QUEUE = 'anomaly-detection';
export const DETECT_ANOMALY_JOB = 'detect-anomaly';
/** Repeatable job that recovers requests whose evaluation was lost (see AnomalyProcessor.sweep). */
export const SWEEP_ANOMALY_JOB = 'sweep-pending-anomalies';

/**
 * Per-job retries (~3 minutes of exponential backoff). BullMQ keeps jobs in Redis, so a job is only as
 * durable as that Redis (docker-compose runs it with AOF, fsync every second: up to ~1 s of queued jobs can
 * be lost on a hard crash, and a Redis without persistence loses everything). That is why the source of
 * truth for "was this request evaluated?" is the `requests.anomaly_status` column, and the sweep
 * re-queues from it. The queue is an optimisation; the database is the guarantee.
 */
export const DETECT_ANOMALY_JOB_OPTS = {
  attempts: 6,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: 1000,
};

/** Only the facts of the request: no prompt or response text ever enters the queue. */
export interface AnomalyJob {
  requestId: string;
  projectId: string;
  model: string;
  costEstimate: number;
  totalTokens: number;
  /** ISO time of the request (the ledger row's createdAt). History is everything BEFORE it. */
  createdAt: string;
}

/** Recovery sweep tuning (env-overridable for operations and tests). */
export function sweepConfig() {
  const n = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    /** How often the sweep runs. */
    everyMs: n(process.env.ANOMALY_SWEEP_INTERVAL_MS, 5 * 60 * 1000),
    /** A PENDING row younger than this is assumed to be on its way through the normal queue. */
    minAgeMs: n(process.env.ANOMALY_SWEEP_MIN_AGE_MS, 2 * 60 * 1000),
    /** Past this age a still-PENDING row is declared FAILED (terminal): a spike alert that late is not actionable. */
    maxAgeMs: n(process.env.ANOMALY_SWEEP_MAX_AGE_MS, 24 * 60 * 60 * 1000),
    /** A FAILED row is retried at most this often (anomaly_evaluated_at is its last-attempt time). */
    failedRetryMs: n(process.env.ANOMALY_SWEEP_FAILED_RETRY_MS, 60 * 60 * 1000),
    batch: n(process.env.ANOMALY_SWEEP_BATCH, 200),
  };
}

/** Default: at most one anomaly alert per project and model every 30 minutes. */
export function anomalyAlertWindowSeconds(): number {
  const v = Number(process.env.ANOMALY_ALERT_DEDUP_SECONDS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 30 * 60;
}

/** A claim is first held as a short LEASE and extended to the full window only once the alert is recorded. */
export const ANOMALY_CLAIM_LEASE_SECONDS = 60;

export function anomalyAlertDedupKey(projectId: string, model: string): string {
  return `spendguard:anomaly-alert:${projectId}:${model}`;
}

/** The alert title doubles as the database-side dedupe key (project + type + title + time window). */
export function anomalyAlertTitle(model: string): string {
  return `⚡ Spend Spike Detected: ${model}`;
}
