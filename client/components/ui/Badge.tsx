import React from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'critical' | 'info';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-fg-secondary border-line',
  accent: 'bg-accent-subtle text-accent border-accent-border',
  success: 'bg-success-bg text-success border-success-border',
  warning: 'bg-warning-bg text-warning border-warning-border',
  critical: 'bg-critical-bg text-critical border-critical-border',
  info: 'bg-info-bg text-info border-info-border',
};

/**
 * The one pill/badge in the app (shadcn's Badge pattern, on our design tokens).
 * Icon and text share a single flex line with one line-height, so they stay on the same
 * baseline. Long text truncates with the full value in the tooltip.
 */
export function Badge({
  tone = 'neutral',
  icon: Icon,
  mono = false,
  title,
  className = '',
  children,
}: {
  tone?: BadgeTone;
  icon?: React.ElementType;
  mono?: boolean;
  /** Tooltip; defaults to the text when it is a plain string. */
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const tooltip = title ?? (typeof children === 'string' ? children : undefined);
  return (
    <span
      title={tooltip}
      className={`inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-caption font-semibold leading-4 align-middle ${
        mono ? 'font-mono' : ''
      } ${TONES[tone]} ${className}`}
    >
      {Icon && <Icon className="w-3 h-3 shrink-0" aria-hidden />}
      <span className="truncate">{children}</span>
    </span>
  );
}
