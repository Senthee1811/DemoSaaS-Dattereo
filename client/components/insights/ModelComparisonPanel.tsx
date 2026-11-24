'use client';

import React from 'react';
import { useApi } from '@/lib/use-api';
import { CardSkeleton } from '@/components/ui/LoadingSkeleton';
import { InlineAlert } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/Badge';
import { ModelComparison, ModelComparisonResponse, signedUsd, usd, usdRange } from '@/lib/insights';
import { CARD, q } from './shared';

const range = (low: number, high: number) => usdRange(low, high, ' – ');
const signedRange = (low: number, high: number) => (Math.abs(low - high) < 0.005 ? signedUsd(low) : `${signedUsd(low)} to ${signedUsd(high)}`);

function Checks({ checks }: { checks: ModelComparison['checks'] }) {
  const problems = checks.filter((c) => c.status !== 'pass');
  if (!problems.length) return <Badge tone="success">Compatible with observed usage</Badge>;
  return (
    <span className="flex flex-wrap gap-1">
      {problems.map((c) => (
        <Badge key={c.id} tone={c.status === 'fail' ? 'critical' : 'warning'} title={c.detail}>
          {c.id.replace('_', ' ')}: {c.status}
        </Badge>
      ))}
    </span>
  );
}

/** Historical traffic re-priced on other models. Cost only; the disclaimer is always visible. */
export function ModelComparisonPanel({ projectId }: { projectId: string }) {
  const { data, error, loading } = useApi<ModelComparisonResponse>(`/api/v1/insights/model-comparison?${q(projectId, 'days=30')}`);

  return (
    <section className="space-y-4" aria-label="Model cost comparison">
      <div>
        <h3 className="font-serif text-lg text-fg">Compare model costs</h3>
        <p className="text-label text-fg-muted">What the last 30 days of traffic would have cost on other configured models.</p>
      </div>
      <InlineAlert variant="info" title="Cost only. Quality is not assessed.">
        {data?.disclaimer ?? 'A cheaper model is not claimed to be equivalent. Output quality, latency and behaviour are not measured, and any change needs your own evaluation and approval.'}
      </InlineAlert>

      {error && <InlineAlert variant="error" title="Could not load the comparison">{error}</InlineAlert>}
      {!data && loading && <CardSkeleton />}
      {data && data.sources.length === 0 && <p className="text-label text-fg-secondary">No usage in the last 30 days to compare.</p>}

      {data?.sources.map((s) => (
        <div key={s.usage.model} className={CARD} data-testid="comparison-source">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-sm font-semibold text-fg">{s.usage.model}</h4>
            <p className="text-label text-fg-secondary tabular-nums">
              {s.usage.requests.toLocaleString('en-US')} requests · {usd(s.usage.actualCostUsd)} actual · avg {Math.round(s.distribution.input.avg).toLocaleString('en-US')} in / {Math.round(s.distribution.output.avg).toLocaleString('en-US')} out tokens (p95 {Math.round(s.distribution.input.p95).toLocaleString('en-US')} / {Math.round(s.distribution.output.p95).toLocaleString('en-US')})
            </p>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs min-w-[38rem]">
              <thead className="text-fg-muted text-left">
                <tr><th className="py-1 font-medium">Candidate</th><th className="font-medium text-right">Would have cost</th><th className="font-medium text-right">Cost change</th><th className="font-medium pl-4">Checks</th></tr>
              </thead>
              <tbody>
                {s.comparisons.slice(0, 5).map((c) => (
                  <tr key={c.candidate.model} className={`border-t border-line ${c.eligible ? '' : 'opacity-60'}`}>
                    <td className="py-2 font-medium">{c.candidate.model} <span className="text-fg-muted font-normal">{c.candidate.provider}</span></td>
                    <td className="text-right tabular-nums">{range(c.hypotheticalUsd.low, c.hypotheticalUsd.high)}</td>
                    <td className={`text-right tabular-nums ${c.savingsUsd.low > 0 ? 'text-success' : c.savingsUsd.high < 0 ? 'text-critical' : 'text-fg'}`}>
                      {signedRange(-c.savingsUsd.high, -c.savingsUsd.low)}
                    </td>
                    <td className="pl-4"><Checks checks={c.checks} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="mt-3 text-caption text-fg-muted">
            <summary className="cursor-pointer font-semibold">Assumptions</summary>
            <ul className="mt-1 list-disc pl-4 space-y-0.5">
              {[...new Set(s.comparisons.slice(0, 5).flatMap((c) => c.assumptions))].map((a) => <li key={a}>{a}</li>)}
            </ul>
          </details>
        </div>
      ))}

      {data && (
        <p className="text-caption text-fg-muted">
          Not assessed: {data.notAssessed.join(', ')}. {data.gatewayLimitations.join(' ')}
        </p>
      )}
    </section>
  );
}
