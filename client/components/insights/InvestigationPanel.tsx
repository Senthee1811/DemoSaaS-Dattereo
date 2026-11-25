'use client';

import React, { useState } from 'react';
import { SearchCheck } from 'lucide-react';
import { useApi } from '@/lib/use-api';
import { formatDateTime, utcLabel } from '@/lib/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardSkeleton } from '@/components/ui/LoadingSkeleton';
import { InlineAlert } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/Badge';
import { DRIVER_LABEL, InvestigationResponse, SUFFICIENCY_LABEL, signedUsd, usd } from '@/lib/insights';
import { CARD, Freshness, q, Segmented } from './shared';

const WINDOWS = [
  { id: 24, label: 'Last 24 hours' },
  { id: 168, label: 'Last 7 days' },
  { id: 720, label: 'Last 30 days' },
];
const DIM_LABEL: Record<string, string> = { model: 'Models', key: 'Gateway keys', application: 'Applications', team: 'Teams', project: 'Projects' };

/** Why did spend change? Each statement lists the ledger request ids it was computed from. */
export function InvestigationPanel({ projectId }: { projectId: string }) {
  const [hours, setHours] = useState(24);
  const { data, error, loading, fetchedAt, isStale } = useApi<InvestigationResponse>(`/api/v1/insights/investigation?${q(projectId, `hours=${hours}`)}`, { cacheMs: 60_000 });

  return (
    <div className="space-y-4">
      <Segmented label="Window to investigate" value={hours} options={WINDOWS} onChange={setHours} />
      <Freshness fetchedAt={fetchedAt} isStale={isStale} />
      {error && <InlineAlert variant="error" title="Could not run the investigation">{error}</InlineAlert>}
      {!data && loading && <CardSkeleton />}

      {data && data.explanations.length === 1 && data.explanations[0].id === 'summary' && data.decomposition.windowSpendUsd === 0 && (
        <EmptyState icon={SearchCheck} title="No spend in this window" description="Pick a longer window, or wait for traffic." compact />
      )}

      {data && data.decomposition.windowSpendUsd > 0 && (
        <>
          <div className={CARD}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h3 className="font-serif text-lg text-fg">What changed</h3>
              <Badge tone={data.sufficiency === 'high' || data.sufficiency === 'medium' ? 'success' : 'warning'}>
                Baseline: {SUFFICIENCY_LABEL[data.sufficiency]} ({data.baseline.daysWithSpend} days with spend)
              </Badge>
            </div>

            <p className="mb-3 text-caption text-fg-muted" data-testid="investigation-ranges">
              Comparing <span className="text-fg-secondary" title={`${utcLabel(data.window.from)} → ${utcLabel(data.window.to)}`}>{formatDateTime(data.window.from)} → {formatDateTime(data.window.to)}</span>{' '}
              with the {data.baseline.days} days before it{data.baseline.from ? <> (<span title={`${utcLabel(data.baseline.from)} → ${utcLabel(data.baseline.to ?? data.window.from)}`}>from {formatDateTime(data.baseline.from)}</span>)</> : null}, scaled to the same length.
            </p>

            {data.decomposition.status === 'no_baseline' && (
              <InlineAlert variant="info" title="Not enough history to explain the change">
                {data.decomposition.note ?? 'There was no comparable spend before this window.'} This is not the same as &ldquo;no change&rdquo;: the window
                below is real spend, but there is nothing to compare it with yet.
              </InlineAlert>
            )}
            {data.decomposition.status === 'ok' && Math.abs(data.decomposition.deltaUsd) < 0.005 && (
              <p className="mb-3 text-xs text-fg-secondary" data-testid="no-change">Spend matched the baseline: no change worth explaining.</p>
            )}

            {data.decomposition.effects && (
              <div className="mb-4 space-y-2" data-testid="decomposition">
                <p className="text-label text-fg-muted">The change of {signedUsd(data.decomposition.deltaUsd)} splits exactly into:</p>
                {(Object.keys(DRIVER_LABEL) as Array<keyof typeof DRIVER_LABEL>).map((k) => {
                  const v = data.decomposition.effects![k];
                  const max = Math.max(...Object.values(data.decomposition.effects!).map(Math.abs), 1e-9);
                  return (
                    <div key={k} className="flex items-center gap-3 text-xs">
                      <span className="w-56 shrink-0 text-fg-secondary">{DRIVER_LABEL[k]}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-surface-muted overflow-hidden" aria-hidden="true">
                        <div className={`h-full rounded-full ${v >= 0 ? 'bg-accent' : 'bg-success'}`} style={{ width: `${(Math.abs(v) / max) * 100}%` }} />
                      </div>
                      <span className="w-20 text-right tabular-nums text-fg">{signedUsd(v)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <ul className="space-y-3">
              {data.explanations.map((x) => (
                <li key={x.id} className="text-sm text-fg" data-testid="explanation">
                  <p>{x.text}</p>
                  <p className="mt-1 text-caption text-fg-muted flex flex-wrap items-center gap-1.5">
                    <span>Based on: {x.evidence.basis}</span>
                    {x.evidence.requestIds.slice(0, 3).map((id) => (
                      <code key={id} className="font-mono px-1.5 py-0.5 rounded-control bg-surface-muted" title="Ledger request id (see the Audit Ledger)">{id.slice(0, 18)}…</code>
                    ))}
                    {x.evidence.requestIds.length > 3 && <span>+{x.evidence.requestIds.length - 3} more</span>}
                  </p>
                </li>
              ))}
            </ul>
            {data.changePoint && (
              <p className="mt-3 text-label text-fg-secondary" title={utcLabel(data.changePoint.startedAt)}>
                Change started around {formatDateTime(data.changePoint.startedAt)}.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Object.entries(data.contributors)
              .filter(([, list]) => list.some((c) => c.deltaUsd !== 0))
              .map(([dim, list]) => (
                <div key={dim} className={CARD}>
                  <h4 className="text-label font-mono uppercase tracking-wider text-fg-muted mb-2">{DIM_LABEL[dim] ?? dim}: contribution to the change</h4>
                  <table className="w-full text-xs">
                    <tbody>
                      {list.slice(0, 5).map((c) => (
                        <tr key={c.key ?? '__none'} className="border-t border-line first:border-0">
                          <td className="py-1.5 pr-2 truncate max-w-[14rem]">
                            {c.label} {c.isNew && <Badge tone="accent">new</Badge>}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">{signedUsd(c.deltaUsd)}</td>
                          <td className="py-1.5 pl-2 text-right text-fg-muted tabular-nums">{c.shareOfChange === null ? '' : `${Math.round(c.shareOfChange * 100)}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>

          {data.evidence.topRequests.length > 0 && (
            <div className={CARD}>
              <h4 className="text-label font-mono uppercase tracking-wider text-fg-muted mb-2">Most expensive requests in the window (ledger records, no content)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[34rem]">
                  <thead className="text-fg-muted text-left">
                    <tr><th className="py-1 font-medium">Request</th><th className="font-medium">Time</th><th className="font-medium">Model</th><th className="font-medium text-right">Tokens</th><th className="font-medium text-right">Cost</th></tr>
                  </thead>
                  <tbody>
                    {data.evidence.topRequests.slice(0, 8).map((r) => (
                      <tr key={r.id} className="border-t border-line">
                        <td className="py-1.5 font-mono">{r.id.slice(0, 18)}…</td>
                        <td title={utcLabel(r.at)}>{formatDateTime(r.at)}</td>
                        <td>{r.model}</td>
                        <td className="text-right tabular-nums">{(r.tokensIn + r.tokensOut).toLocaleString('en-US')}</td>
                        <td className="text-right tabular-nums">{usd(r.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <details className="text-label text-fg-secondary">
            <summary className="cursor-pointer font-semibold">How this is calculated</summary>
            <p className="mt-2 max-w-3xl">{data.method}</p>
          </details>
        </>
      )}
    </div>
  );
}
