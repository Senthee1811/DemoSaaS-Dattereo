'use client';

import React, { useState } from 'react';
import { Layers } from 'lucide-react';
import { useApi } from '@/lib/use-api';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardSkeleton } from '@/components/ui/LoadingSkeleton';
import { InlineAlert } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/Badge';
import { AttributionResponse, Dimension, DIMENSIONS, pct, usd } from '@/lib/insights';
import { CARD, Freshness, q, Segmented } from './shared';

const RANGES = [
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
];

/** Where the money goes, by one dimension at a time. Spend with no tag is its own "Unattributed" row. */
export function SpendBreakdownPanel({ projectId }: { projectId: string }) {
  const [dimension, setDimension] = useState<Dimension>('model');
  const [days, setDays] = useState(30);
  const { data, error, loading, fetchedAt, isStale } = useApi<AttributionResponse>(`/api/v1/insights/attribution?${q(projectId, `dimension=${dimension}&days=${days}`)}`, { cacheMs: 60_000 });
  const [showHow, setShowHow] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Segmented label="Break spend down by" value={dimension} options={DIMENSIONS} onChange={setDimension} />
        <Segmented label="Time range" value={days} options={RANGES} onChange={setDays} />
      </div>

      <Freshness fetchedAt={fetchedAt} isStale={isStale} />
      {error && <InlineAlert variant="error" title="Could not load spend">{error}</InlineAlert>}
      {!data && loading && <CardSkeleton />}

      {data && data.rows.length === 0 && (
        <EmptyState icon={Layers} title="No spend in this period" description="Spend appears here as soon as requests go through the gateway." compact />
      )}

      {data && data.rows.length > 0 && (
        <div className={CARD}>
          <div className="flex items-baseline justify-between mb-4">
            <p className="text-label font-mono uppercase tracking-wider text-fg-muted">Total, last {days} days</p>
            <p className="font-serif text-2xl text-fg tabular-nums" data-testid="attribution-total">{usd(data.totals.costUsd)}</p>
          </div>

          {data.coverage.unattributedUsd > 0 && data.howToAttribute && (
            <div className="mb-4 p-3 rounded-field bg-warning-bg border border-warning-border text-label text-fg-secondary" data-testid="coverage-note">
              <p>
                <span className="font-semibold text-fg">{pct(data.coverage.attributedShare)} of spend is attributed.</span> {usd(data.coverage.unattributedUsd)} has no{' '}
                {dimension} tag and is shown separately, not spread across the others.{' '}
                <button type="button" className="underline font-semibold" onClick={() => setShowHow((v) => !v)}>
                  {showHow ? 'Hide' : 'How to attribute it'}
                </button>
              </p>
              {showHow && (
                <ul className="mt-2 space-y-1 list-disc pl-4">
                  <li>{data.howToAttribute.keyLevel}</li>
                  {Object.entries(data.howToAttribute.headers).map(([h, d]) => (
                    <li key={h}>
                      <code className="font-mono">{h}</code>: {d}
                    </li>
                  ))}
                  <li>{data.howToAttribute.precedence}</li>
                </ul>
              )}
            </div>
          )}

          <ul className="space-y-3">
            {data.rows.map((r) => (
              <li key={r.key ?? '__none'} data-testid="attribution-row">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-medium text-fg truncate flex items-center gap-2">
                    {r.label}
                    {r.unattributed && <Badge tone="warning">Not attributed</Badge>}
                  </span>
                  <span className="tabular-nums text-fg shrink-0">
                    {usd(r.costUsd)} <span className="text-fg-muted">· {pct(r.share, 1)}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-surface-muted overflow-hidden" aria-hidden="true">
                  <div className={`h-full rounded-full ${r.unattributed ? 'bg-fg-muted' : 'bg-accent'}`} style={{ width: `${Math.max(1, r.share * 100)}%` }} />
                </div>
                <p className="mt-1 text-caption text-fg-muted tabular-nums">
                  {r.requests.toLocaleString('en-US')} requests · {r.tokensPerRequest.toLocaleString('en-US')} tokens/request · {usd(r.costPerRequestUsd)}/request
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
