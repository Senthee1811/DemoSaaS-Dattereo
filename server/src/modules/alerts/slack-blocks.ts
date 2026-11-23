export interface SlackAlertInput {
  title: string;
  message: string;
  projectName: string;
  thresholdType: string;
  triggeredAt: Date;
}

const TYPE_LABEL: Record<string, string> = {
  PERCENT_80: 'Budget warning',
  HARD_BLOCK: 'Hard block',
  ANOMALY_DETECTED: 'Spend anomaly',
};

// Slack mrkdwn: & < > must be escaped in user-controlled text.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Slack Block Kit: a header section plus a context line, built from the real alert. */
export function buildAlertBlocks(a: SlackAlertInput): unknown[] {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${esc(a.title)}*\n${esc(a.message)}` },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*Project:* ${esc(a.projectName)}  •  *Type:* ${TYPE_LABEL[a.thresholdType] ?? esc(a.thresholdType)}  •  ${a.triggeredAt.toISOString()}`,
        },
      ],
    },
  ];
}

/** Slack Incoming Webhook URLs only. Anything else is rejected (no arbitrary server-side requests). */
export function isValidSlackWebhookUrl(url: string): boolean {
  if (typeof url !== 'string' || url.length > 512) return false;
  if (/^https:\/\/hooks\.slack\.com\/(services|workflows|triggers)\/[A-Za-z0-9/_-]+$/.test(url)) return true;
  // Non-production only: lets e2e tests point at a local stand-in for Slack.
  return process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[A-Za-z0-9/_-]*$/.test(url);
}
