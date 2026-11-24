/** BullMQ queue that scores each completed request for a spend spike, off the request path. */
export const ANOMALY_QUEUE = 'anomaly-detection';
export const DETECT_ANOMALY_JOB = 'detect-anomaly';

/** Retried for roughly 1-2 minutes: enough for a delayed ledger row to land (see the processor). */
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

/** Default: at most one anomaly alert per project and model every 30 minutes. */
export function anomalyAlertWindowSeconds(): number {
  const v = Number(process.env.ANOMALY_ALERT_DEDUP_SECONDS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 30 * 60;
}

export function anomalyAlertDedupKey(projectId: string, model: string): string {
  return `spendguard:anomaly-alert:${projectId}:${model}`;
}
