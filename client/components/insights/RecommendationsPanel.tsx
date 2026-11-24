'use client';

import React, { useState } from 'react';
import { Lightbulb, RefreshCw } from 'lucide-react';
import { useApi } from '@/lib/use-api';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { useStoredUser } from '@/lib/client-storage';
import { formatDateTime } from '@/lib/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardSkeleton } from '@/components/ui/LoadingSkeleton';
import { ConfirmDialog, InlineAlert, useToast } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/Badge';
import { evidenceText, impactText, Recommendation, SEVERITY_TONE } from '@/lib/insights';
import { CARD, q } from './shared';
import { ModelComparisonPanel } from './ModelComparisonPanel';

type Decision = 'acknowledge' | 'dismiss' | 'approve_evaluation';
const STATUS_LABEL: Record<Recommendation['status'], string> = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  APPROVED_FOR_EVALUATION: 'Approved for evaluation',
  DISMISSED: 'Dismissed',
  RESOLVED: 'Resolved',
};

/** Evidence-based findings with the calculation behind each one and the human decision they need, if any. */
export function RecommendationsPanel({ projectId }: { projectId: string }) {
  const { data, error, loading, reload } = useApi<{ recommendations: Recommendation[] }>(`/api/v1/insights/recommendations?${q(projectId)}`);
  const role = useStoredUser()?.role ?? 'MEMBER';
  const canApprove = role === 'OWNER' || role === 'ADMIN';
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [confirm, setConfirm] = useState<Recommendation | null>(null);

  const decide = async (r: Recommendation, action: Decision, note?: string) => {
    const res = await authFetch(`/api/v1/insights/recommendations/${encodeURIComponent(r.id)}`, { method: 'PATCH', body: JSON.stringify({ action, note }) });
    if (!res.ok) throw new Error(await readApiError(res, 'The decision could not be saved.'));
    reload();
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await authFetch('/api/v1/insights/recommendations/refresh', { method: 'POST' });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not re-evaluate.'));
      const out = (await res.json()) as { created: number; updated: number; resolved: number };
      toast.success('Re-evaluated', `${out.created} new, ${out.updated} updated, ${out.resolved} resolved.`);
      reload();
    } catch (err) {
      toast.error('Could not re-evaluate', err instanceof Error ? err.message : undefined);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-4" aria-label="Recommendations">
        <div className="flex items-center justify-between gap-3">
          <p className="text-label text-fg-muted max-w-2xl">
            Each finding is computed from your ledger with fixed rules, and shows its numbers, how it was calculated and how sure we are. Nothing is changed automatically.
          </p>
          {canApprove && (
            <button type="button" onClick={refresh} disabled={refreshing} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-line text-label font-semibold text-fg-secondary hover:text-fg disabled:opacity-60">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden /> Re-evaluate now
            </button>
          )}
        </div>

        {error && <InlineAlert variant="error" title="Could not load recommendations">{error}</InlineAlert>}
        {!data && loading && <CardSkeleton />}
        {data && data.recommendations.length === 0 && (
          <EmptyState icon={Lightbulb} title="Nothing to act on right now" description="Findings appear here when spend is unusual, a budget is at risk, or a cheaper model may be worth evaluating." compact />
        )}

        {data?.recommendations.map((r) => {
          const impact = impactText(r.impact);
          return (
            <article key={r.id} className={CARD} data-testid="recommendation">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge tone={SEVERITY_TONE[r.severity]}>{r.severity}</Badge>
                <Badge tone="neutral">Confidence: {r.confidence}</Badge>
                {r.requiresApproval && <Badge tone="accent">Needs approval</Badge>}
                <Badge tone={r.status === 'OPEN' ? 'info' : 'neutral'}>{STATUS_LABEL[r.status]}</Badge>
                {r.projectName && <span className="text-caption text-fg-muted">{r.projectName}</span>}
              </div>
              <h3 className="font-serif text-lg text-fg leading-snug">{r.title}</h3>
              <p className="mt-1 text-sm text-fg-secondary">{r.summary}</p>
              {impact && (
                <p className="mt-2 text-xs text-fg" data-testid="impact">
                  <span className="font-semibold">Potential impact:</span> {impact}
                </p>
              )}
              <p className="mt-2 text-xs text-fg-secondary">
                <span className="font-semibold text-fg">Suggested action:</span> {r.action}
              </p>

              <details className="mt-3 text-label text-fg-secondary">
                <summary className="cursor-pointer font-semibold">Evidence and calculation</summary>
                <p className="mt-2">{r.method}</p>
                <pre className="mt-2 p-3 rounded-field bg-surface-muted overflow-x-auto text-caption font-mono max-h-64">{evidenceText(r.evidence)}</pre>
              </details>

              {r.decidedAt && (
                <p className="mt-3 text-caption text-fg-muted">
                  {STATUS_LABEL[r.status]} on {formatDateTime(r.decidedAt)}
                  {r.decisionNote ? `: “${r.decisionNote}”` : ''}
                </p>
              )}

              {(r.status === 'OPEN' || r.status === 'ACKNOWLEDGED') && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {r.status === 'OPEN' && (
                    <button type="button" className="px-3 py-1.5 rounded-full border border-line text-label font-semibold hover:bg-surface-muted" onClick={() => decide(r, 'acknowledge').catch((e) => toast.error('Not saved', e.message))}>
                      Acknowledge
                    </button>
                  )}
                  <button type="button" className="px-3 py-1.5 rounded-full border border-line text-label font-semibold hover:bg-surface-muted" onClick={() => decide(r, 'dismiss').catch((e) => toast.error('Not saved', e.message))}>
                    Dismiss for 14 days
                  </button>
                  {r.requiresApproval && (
                    <button
                      type="button"
                      disabled={!canApprove}
                      title={canApprove ? undefined : 'Only an owner or admin can approve'}
                      className="px-3 py-1.5 rounded-full bg-accent text-white text-label font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => setConfirm(r)}
                    >
                      Approve evaluation
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </section>

      <ModelComparisonPanel projectId={projectId} />

      <ConfirmDialog
        open={confirm !== null}
        title="Approve a model evaluation?"
        description={confirm ? `You are recording a decision to EVALUATE the suggestion “${confirm.title}”. Cost is the only thing that was compared.` : ''}
        consequences={['SpendGuard will not change any model, key or project setting.', 'Quality, latency and behaviour have not been assessed. Test the model on your own prompts before switching anything.']}
        reversible="The decision is recorded with your name and time. It can be superseded by a later decision."
        confirmLabel="Record approval"
        onConfirm={async () => {
          if (confirm) await decide(confirm, 'approve_evaluation');
        }}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
