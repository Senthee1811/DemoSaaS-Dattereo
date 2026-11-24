'use client';

import React, { useState } from 'react';
import { Scale } from 'lucide-react';
import { useApi } from '@/lib/use-api';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { formatDateTime, utcLabel } from '@/lib/format';
import { useStoredUser } from '@/lib/client-storage';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { ConfirmDialog, InlineAlert, useToast } from '@/components/ui/feedback';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardSkeleton } from '@/components/ui/LoadingSkeleton';

interface Exposure {
  unreconciled?: Array<{ provider: string; billingStatus: string; attempts: number; maxExposureUsd: number }>;
  confirmedUnledgeredUsd?: Array<{ provider: string; attempts: number; usd: number }>;
}
interface Attempt {
  id: string;
  projectName?: string;
  provider: string;
  model: string;
  errorClass: string;
  executionStatus: string | null;
  billingStatus: string | null;
  estimatedCostUsd: number;
  timestamp: string;
}
interface Accuracy {
  windowDays?: number;
  providers?: Array<{ provider: string; sufficient: boolean; verdict: string; samples: number; requiredSamples: number; spanDays: number; requiredSpanDays: number; note: string }>;
  groups?: Array<{
    provider: string; model: string; estimatorVersion: string | null; samples: number; indicativeOnly: boolean;
    underestimatedPct: number | null; reservationUnderCoveredInputPct: number | null; estimateToActualRatio: { p50: number | null; p95: number | null };
    marginNeededForP99Coverage: number | null; financialOverrun: { requests: number; usd: number; pctOfCost: number | null };
  }>;
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;
const BILLING_LABEL: Record<string, { label: string; tone: BadgeTone }> = {
  UNCERTAIN: { label: 'May have been billed', tone: 'warning' },
  LIKELY_CHARGED: { label: 'Likely billed', tone: 'critical' },
  NOT_EXPECTED: { label: 'No charge expected', tone: 'neutral' },
};
const EXECUTION_LABEL: Record<string, string> = {
  NOT_SENT: 'Not sent to the provider',
  REJECTED_BY_PROVIDER: 'Rejected by the provider',
  PROVIDER_ERROR: 'Provider error (5xx)',
  EXECUTION_UNKNOWN: 'Timed out / connection lost',
  RESPONSE_UNUSABLE: 'Answered, but unreadable',
};
const VERDICT: Record<string, { label: string; tone: BadgeTone }> = {
  insufficient_data: { label: 'Not enough data', tone: 'neutral' },
  reservation_under_covers_input: { label: 'Reservations too small', tone: 'warning' },
  no_action_indicated: { label: 'No change indicated', tone: 'success' },
};

/**
 * Failed gateway calls the provider may have billed (usage never reached the ledger), and how well token estimates
 * matched real usage. Owner/admin only. Recording an outcome changes NO spend figure: it documents the invoice check.
 */
export function ReconciliationPanel() {
  const role = useStoredUser()?.role ?? 'MEMBER';
  if (role !== 'OWNER' && role !== 'ADMIN') {
    return <p className="text-label text-fg-muted">Only an owner or admin can review failed-call exposure and estimator accuracy.</p>;
  }
  return <Inner />;
}

function Inner() {
  const exposure = useApi<Exposure>('/api/v1/audit/attempts/exposure');
  const attempts = useApi<{ attempts?: Attempt[] }>('/api/v1/audit/attempts?billingStatus=UNCERTAIN,LIKELY_CHARGED&unreconciled=true&limit=25');
  const accuracy = useApi<Accuracy>('/api/v1/audit/estimator-accuracy?days=30');
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<'NOT_CHARGED_CONFIRMED' | 'CHARGED_CONFIRMED'>('NOT_CHARGED_CONFIRMED');
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState<Attempt | null>(null);

  const open = Array.isArray(exposure.data?.unreconciled) ? exposure.data!.unreconciled! : [];
  const confirmed = Array.isArray(exposure.data?.confirmedUnledgeredUsd) ? exposure.data!.confirmedUnledgeredUsd! : [];
  const rows = Array.isArray(attempts.data?.attempts) ? attempts.data!.attempts! : [];
  const providers = Array.isArray(accuracy.data?.providers) ? accuracy.data!.providers! : [];
  const groups = Array.isArray(accuracy.data?.groups) ? accuracy.data!.groups! : [];
  const exposureTotal = open.reduce((a, r) => a + (Number(r.maxExposureUsd) || 0), 0);
  const costValid = outcome === 'NOT_CHARGED_CONFIRMED' || (Number(cost) > 0 && Number(cost) <= 100000);

  const save = async (a: Attempt) => {
    const res = await authFetch(`/api/v1/audit/attempts/${encodeURIComponent(a.id)}/reconcile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: outcome, ...(outcome === 'CHARGED_CONFIRMED' ? { costUsd: Number(cost) } : {}), note: note.trim() || undefined }),
    });
    if (!res.ok) throw new Error(await readApiError(res, 'The outcome was not recorded.'));
    toast.success('Outcome recorded', 'No spend figure was changed.');
    setEditing(null);
    setCost('');
    setNote('');
    exposure.reload();
    attempts.reload();
  };

  return (
    <div className="space-y-5" data-testid="reconciliation">
      <InlineAlert variant="info" title="Exposure is not spend">
        When a call fails, its reservation is released and nothing is charged to your budget. If the provider may still have run it (a timeout, a
        dropped connection, a provider error, or an unreadable answer), it is listed here with the most it could have cost. Compare these with your
        provider invoice and record what you find. Recording an outcome changes no ledger entry or budget figure.
      </InlineAlert>

      {(exposure.error || attempts.error) && <InlineAlert variant="error" title="Could not load failed-call exposure">{exposure.error ?? attempts.error}</InlineAlert>}
      {!exposure.data && exposure.loading && <CardSkeleton />}

      {exposure.data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-card border border-line bg-surface">
            <p className="text-label text-fg-muted">Unreconciled exposure (upper bound)</p>
            <p className="font-serif text-2xl text-fg tabular-nums" data-testid="exposure-total">{usd(exposureTotal)}</p>
            <p className="text-caption text-fg-muted">{open.reduce((a, r) => a + r.attempts, 0)} failed calls · {open.map((r) => `${r.provider}: ${r.attempts}`).join(', ') || 'none'}</p>
          </div>
          <div className="p-4 rounded-card border border-line bg-surface">
            <p className="text-label text-fg-muted">Confirmed on an invoice, not in the ledger</p>
            <p className="font-serif text-2xl text-fg tabular-nums">{usd(confirmed.reduce((a, r) => a + r.usd, 0))}</p>
            <p className="text-caption text-fg-muted">Book these outside SpendGuard. They are not added to budgets automatically.</p>
          </div>
        </div>
      )}

      {exposure.data && rows.length === 0 && !attempts.loading && (
        <EmptyState icon={Scale} title="Nothing to reconcile" description="No failed call is waiting for an invoice check." compact />
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto border border-line rounded-card">
          <table className="w-full text-xs min-w-[44rem]">
            <thead className="text-fg-muted text-left bg-surface-subtle">
              <tr><th className="py-2 px-3 font-medium">When</th><th className="font-medium">Project · model</th><th className="font-medium">What happened</th><th className="font-medium">Billing</th><th className="font-medium text-right">At most</th><th className="px-3" /></tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <React.Fragment key={a.id}>
                  <tr className="border-t border-line align-top" data-testid="exposure-row">
                    <td className="py-2 px-3 whitespace-nowrap" title={utcLabel(a.timestamp)}>{formatDateTime(a.timestamp)}</td>
                    <td className="py-2">{a.projectName ?? '—'} · <span className="font-mono">{a.model}</span></td>
                    <td className="py-2">{EXECUTION_LABEL[a.executionStatus ?? ''] ?? a.errorClass}</td>
                    <td className="py-2">{a.billingStatus && <Badge tone={BILLING_LABEL[a.billingStatus]?.tone ?? 'neutral'}>{BILLING_LABEL[a.billingStatus]?.label ?? a.billingStatus}</Badge>}</td>
                    <td className="py-2 text-right tabular-nums">{usd(Number(a.estimatedCostUsd) || 0)}</td>
                    <td className="py-2 px-3 text-right">
                      <button type="button" className="underline font-semibold" onClick={() => setEditing(editing === a.id ? null : a.id)} aria-expanded={editing === a.id}>
                        {editing === a.id ? 'Cancel' : 'Record outcome'}
                      </button>
                    </td>
                  </tr>
                  {editing === a.id && (
                    <tr className="bg-surface-subtle">
                      <td colSpan={6} className="p-3">
                        <fieldset className="flex flex-wrap items-end gap-3">
                          <legend className="sr-only">Invoice outcome for {a.id}</legend>
                          <label className="flex items-center gap-1.5"><input type="radio" name={`o-${a.id}`} checked={outcome === 'NOT_CHARGED_CONFIRMED'} onChange={() => setOutcome('NOT_CHARGED_CONFIRMED')} /> Not on the invoice</label>
                          <label className="flex items-center gap-1.5"><input type="radio" name={`o-${a.id}`} checked={outcome === 'CHARGED_CONFIRMED'} onChange={() => setOutcome('CHARGED_CONFIRMED')} /> Charged</label>
                          {outcome === 'CHARGED_CONFIRMED' && (
                            <label className="text-label text-fg-secondary">Invoiced amount (USD)
                              <input className="block mt-1 w-32 px-2 py-1.5 rounded-field border border-line bg-surface" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} aria-invalid={!costValid} />
                            </label>
                          )}
                          <label className="text-label text-fg-secondary flex-1 min-w-48">Note (e.g. invoice number)
                            <input className="block mt-1 w-full px-2 py-1.5 rounded-field border border-line bg-surface" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
                          </label>
                          <button type="button" disabled={!costValid} className="px-3 py-1.5 rounded-full bg-accent text-white font-semibold disabled:opacity-50" onClick={() => setConfirming(a)}>Save</button>
                        </fieldset>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pt-2">
        <h3 className="font-serif text-lg text-fg">Token estimate accuracy (last {accuracy.data?.windowDays ?? 30} days)</h3>
        <p className="text-label text-fg-muted max-w-3xl">
          Reservations are sized from an estimate of the prompt plus the full output allowance. This compares the estimate with what providers
          reported, using token counts only (never prompts). Safety margins are never changed automatically.
        </p>
        {accuracy.error && <InlineAlert variant="error" title="Could not load estimator accuracy">{accuracy.error}</InlineAlert>}
        {providers.length === 0 && accuracy.data && <p className="text-label text-fg-muted mt-2">No provider-confirmed usage in this period yet.</p>}
        <ul className="mt-2 space-y-2">
          {providers.map((p) => (
            <li key={p.provider} className="text-xs" data-testid="estimator-provider">
              <span className="font-semibold">{p.provider}</span>{' '}
              <Badge tone={VERDICT[p.verdict]?.tone ?? 'neutral'}>{VERDICT[p.verdict]?.label ?? p.verdict}</Badge>{' '}
              <span className="text-fg-muted">{p.samples.toLocaleString('en-US')} of {p.requiredSamples.toLocaleString('en-US')} samples · {p.spanDays} of {p.requiredSpanDays} days.</span>{' '}
              <span className="text-fg-secondary">{p.note}</span>
            </li>
          ))}
        </ul>
        {groups.length > 0 && (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs min-w-[40rem]">
              <thead className="text-fg-muted text-left"><tr><th className="py-1 font-medium">Model</th><th className="font-medium text-right">Samples</th><th className="font-medium text-right">Under-estimated</th><th className="font-medium text-right">Reservation too small</th><th className="font-medium text-right">Estimate/actual p50</th><th className="font-medium text-right">Overrun</th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={`${g.provider}-${g.model}-${g.estimatorVersion}`} className="border-t border-line">
                    <td className="py-1.5">{g.model} {g.indicativeOnly && <Badge tone="neutral">indicative only</Badge>}</td>
                    <td className="text-right tabular-nums">{g.samples.toLocaleString('en-US')}</td>
                    <td className="text-right tabular-nums">{g.underestimatedPct == null ? '—' : `${g.underestimatedPct}%`}</td>
                    <td className="text-right tabular-nums">{g.reservationUnderCoveredInputPct == null ? '—' : `${g.reservationUnderCoveredInputPct}%`}</td>
                    <td className="text-right tabular-nums">{g.estimateToActualRatio.p50 ?? '—'}</td>
                    <td className="text-right tabular-nums">{g.financialOverrun.requests ? `${usd(g.financialOverrun.usd)} (${g.financialOverrun.pctOfCost ?? 0}%)` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirming !== null}
        tone="sensitive"
        title="Record this invoice outcome?"
        description={confirming ? (outcome === 'CHARGED_CONFIRMED' ? `The provider charged ${usd(Number(cost))} for this failed call.` : 'The provider did not charge for this failed call.') : ''}
        consequences={['It can be recorded once per call and is kept in the audit trail.', 'No ledger entry or budget figure is changed.']}
        confirmLabel="Record outcome"
        onConfirm={async () => {
          if (confirming) await save(confirming);
        }}
        onClose={() => setConfirming(null)}
      />
    </div>
  );
}
