/** BullMQ queue that delivers budget/anomaly alerts to Slack. */
export const ALERT_DELIVERY_QUEUE = 'alert-delivery';
export const DELIVER_ALERT_JOB = 'deliver-alert';

export const DELIVER_ALERT_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: 1000,
};

/**
 * The webhook URL is a secret, so it never enters Redis: the worker reads and
 * decrypts it from the project's AlertConfig when it delivers.
 */
export interface AlertDeliveryJob {
  alertId: string;
  projectId: string;
  blocks: unknown[];
}
