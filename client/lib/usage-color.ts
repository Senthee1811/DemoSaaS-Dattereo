/**
 * The one place that turns "how much of the budget is used" into a color.
 *
 *   Safe     (green)  below the warning boundary
 *   Warning  (amber)  from the warning boundary up to, not including, the cap
 *   Critical (red)    at or over the cap, and any hard-blocked project
 *
 * The warning boundary defaults to 50% and can be changed without touching code by setting
 * NEXT_PUBLIC_USAGE_WARNING_PERCENT (1 to 99; read at build time). The critical boundary is the
 * cap itself (100%), so it is not configurable. This is only the COLOR scale: when an alert is
 * sent is decided by the server's thresholds and is unaffected.
 */
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { ThresholdType } from '@/lib/types';

export const DEFAULT_WARNING_PERCENT = 50;
export const CRITICAL_PERCENT = 100;

export function parseWarningPercent(raw: string | undefined): number {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isFinite(n) && n >= 1 && n <= 99 ? n : DEFAULT_WARNING_PERCENT;
}

export const WARNING_PERCENT = parseWarningPercent(process.env.NEXT_PUBLIC_USAGE_WARNING_PERCENT);

export type UsageLevel = 'safe' | 'warning' | 'critical';

export interface UsageColor {
  level: UsageLevel;
  label: string;
  /** Badge tone (see components/ui/Badge). */
  tone: 'success' | 'warning' | 'critical';
  icon: LucideIcon;
  /** Tailwind classes, all semantic tokens (they follow dark mode). */
  text: string;
  bar: string;
  dot: string;
  tile: string;
}

const SCALE: Record<UsageLevel, Omit<UsageColor, 'level'>> = {
  safe: {
    label: 'Safe',
    tone: 'success',
    icon: ShieldCheck,
    text: 'text-success',
    bar: 'bg-success',
    dot: 'bg-success',
    tile: 'bg-success-bg border-success-border text-success',
  },
  warning: {
    label: 'Warning',
    tone: 'warning',
    icon: AlertTriangle,
    text: 'text-warning',
    bar: 'bg-warning',
    dot: 'bg-warning',
    tile: 'bg-warning-bg border-warning-border text-warning',
  },
  critical: {
    label: 'Critical',
    tone: 'critical',
    icon: ShieldAlert,
    text: 'text-critical',
    bar: 'bg-critical',
    dot: 'bg-critical',
    tile: 'bg-critical-bg border-critical-border text-critical',
  },
};

export function getUsageLevel(percent: number, opts: { blocked?: boolean } = {}): UsageLevel {
  if (opts.blocked) return 'critical';
  const p = Number.isFinite(percent) ? percent : 0;
  if (p >= CRITICAL_PERCENT) return 'critical';
  if (p >= WARNING_PERCENT) return 'warning';
  return 'safe';
}

/** Pass the UNROUNDED percentage: 99.6% must not turn red by rounding to 100. */
export function getUsageColor(percent: number, opts: { blocked?: boolean } = {}): UsageColor {
  const level = getUsageLevel(percent, opts);
  return { level, ...SCALE[level] };
}

/** An alert type on the same scale: the 80% warning is amber, a hard-block is red. */
export function getAlertColor(type: ThresholdType | string): UsageColor {
  if (type === 'HARD_BLOCK') return getUsageColor(CRITICAL_PERCENT);
  if (type === 'PERCENT_50' || type === 'PERCENT_80' || type === 'PERCENT_90' || type === 'ANOMALY_DETECTED') {
    return getUsageColor(WARNING_PERCENT);
  }
  return getUsageColor(0);
}
