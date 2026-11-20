/** BullMQ queue that retries ledger (request row) writes that failed on the hot path. */
export const REQUEST_LEDGER_QUEUE = 'request-ledger';
export const PERSIST_REQUEST_JOB = 'persist-request';

/** Retry for roughly a day before giving up (exponential backoff from 2 s, capped by attempts). */
export const PERSIST_REQUEST_JOB_OPTS = {
  attempts: 20,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: false,
};

/** Serializable request row: `createdAt` travels as an ISO string. */
export type LedgerRowJob = Record<string, unknown> & { id: string; projectId: string; createdAt: string };
