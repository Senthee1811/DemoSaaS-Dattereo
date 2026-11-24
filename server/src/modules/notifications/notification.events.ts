/**
 * Event-driven notifications. Anything in SpendGuard that wants to tell people something publishes ONE event;
 * the notification module decides which destinations receive it. Producers never know about Slack, email or webhooks.
 *
 * Adding an event type = add it here and publish it. Adding a destination type = add a sender in
 * notification-delivery.processor.ts and a validator in notifications.service.ts.
 */

export const EVENT_TYPES = ['budget.alert', 'recommendation.created', 'notification.test'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const CHANNEL_TYPES = ['SLACK', 'WEBHOOK', 'EMAIL'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export interface NotificationEvent {
  /** Unique and stable per real-world occurrence: it is the idempotency key (one delivery per destination). */
  id: string;
  type: EventType;
  orgId: string;
  occurredAt: string;
  /** Human text plus numbers. Never request content, credentials or secrets. */
  data: {
    title: string;
    message: string;
    severity?: 'info' | 'warning' | 'critical';
    [key: string]: unknown;
  };
}

export const NOTIFICATION_QUEUE = 'notification-delivery';
export const DELIVER_JOB = 'deliver';
export const REQUEUE_STALE_JOB = 'requeue-stale-notifications';

/** 5 attempts with exponential backoff (10 s, 20 s, 40 s, 80 s): a destination down for a few minutes still gets the message. */
export const DELIVER_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 10_000 },
  removeOnComplete: 1000,
  removeOnFail: 1000,
};
