'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, ScrollText, TriangleAlert, Loader2 } from 'lucide-react';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { errorMessage } from '@/lib/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { Tip } from '@/components/ui/tooltip';

interface AuditRow {
  id: string;
  projectName?: string;
  provider: string;
  model: string;
  totalTokens: number;
  costEstimate: number;
  statusCode: number;
  isBlocked: boolean;
  isAnomaly: boolean;
  timestamp: string;
}

interface AuditPage {
  logs?: AuditRow[];
  total?: number;
}

const PAGE_SIZE = 100;

/** A UTC day ("YYYY-MM-DD") as an inclusive range for the audit API. Chart buckets are UTC days. */
export function utcDayRange(day: string): { startDate: string; endDate: string } {
  return { startDate: `${day}T00:00:00.000Z`, endDate: `${day}T23:59:59.999Z` };
}

function statusLabel(r: AuditRow): { text: string; tone: string } {
  if (r.isBlocked) return { text: 'Blocked', tone: 'text-sg-critical' };
  if (r.statusCode >= 400) return { text: `Error ${r.statusCode}`, tone: 'text-sg-critical' };
  if (r.isAnomaly) return { text: 'Anomaly', tone: 'text-sg-warning' };
  return { text: 'OK', tone: 'text-sg-success' };
}

/** Right-hand panel listing the individual requests behind one bar/point of the spend chart. */
export function DayRequestsPanel({ day, onClose }: { day: string; onClose: () => void }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    const { startDate, endDate } = utcDayRange(day);
    const qs = new URLSearchParams({ startDate, endDate, limit: String(PAGE_SIZE) });
    authFetch(`/api/v1/audit?${qs.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res, 'Could not load requests for this day.'));
        return (await res.json()) as AuditPage;
      })
      .then((data) => {
        if (cancelled) return;
        setRows(data.logs ?? []);
        setTotal(data.total ?? data.logs?.length ?? 0);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, 'Could not load requests for this day.'));
      });
    return () => {
      cancelled = true;
    };
  }, [day, attempt]);

  const retry = useCallback(() => {
    setRows(null);
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isLoading = rows === null && error === null;
  const daySpend = (rows ?? []).reduce((sum, r) => sum + (r.isBlocked ? 0 : r.costEstimate), 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="day-panel-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-overlay cursor-default" tabIndex={-1} />

      <div className="relative w-full max-w-2xl h-full bg-surface border-l border-sg-border shadow-2xl flex flex-col">
        <div className="p-5 border-b border-sg-border flex items-start justify-between gap-3">
          <div>
            <h3 id="day-panel-title" className="font-serif text-lg font-normal text-fg">
              Requests on {day} <span className="text-xs font-mono text-sg-text-muted">UTC</span>
            </h3>
            {rows && (
              <p className="text-xs text-sg-text-secondary mt-0.5">
                {total} request{total === 1 ? '' : 's'}
                {rows.length > 0 && <> · ${daySpend.toFixed(4)} spent{total > rows.length ? ` (first ${rows.length})` : ''}</>}
              </p>
            )}
          </div>
          <Tip label="Close panel">
            <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="p-1.5 rounded-full hover:bg-sg-surface-muted text-sg-text-secondary"
          >
            <X className="w-4 h-4" />
          </button>
          </Tip>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-10 flex items-center justify-center gap-2 text-xs text-sg-text-secondary" role="status">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading requests…</span>
            </div>
          )}

          {error && (
            <div className="p-6 space-y-3" role="alert">
              <p className="flex items-center gap-2 text-xs text-sg-critical">
                <TriangleAlert className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </p>
              <button
                type="button"
                onClick={retry}
                className="px-4 py-1.5 rounded-full bg-surface hover:bg-sg-surface-muted border border-sg-border text-xs font-semibold"
              >
                Try again
              </button>
            </div>
          )}

          {rows && rows.length === 0 && (
            <div className="p-6">
              <EmptyState icon={ScrollText} title="No requests on this day" description="Nothing went through the gateway during this UTC day." compact />
            </div>
          )}

          {rows && rows.length > 0 && (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-parchment-ivory text-sg-text-secondary border-b border-sg-border">
                <tr>
                  <th className="py-2.5 px-4 font-mono text-label uppercase tracking-wider">Time</th>
                  <th className="py-2.5 px-3 font-mono text-label uppercase tracking-wider">Model</th>
                  <th className="py-2.5 px-3 font-mono text-label uppercase tracking-wider text-right">Tokens</th>
                  <th className="py-2.5 px-3 font-mono text-label uppercase tracking-wider text-right">Cost</th>
                  <th className="py-2.5 px-4 font-mono text-label uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sg-border">
                {rows.map((r) => {
                  const st = statusLabel(r);
                  return (
                    <tr key={r.id} className="hover:bg-parchment-ivory">
                      <td className="py-2.5 px-4 font-mono tabular-nums text-sg-text-secondary whitespace-nowrap">
                        {new Date(r.timestamp).toISOString().slice(11, 19)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-1.5 font-medium text-fg">
                          <ProviderLogo provider={r.provider} size={14} />
                          {r.model}
                        </span>
                        {r.projectName && <span className="block text-label text-sg-text-muted">{r.projectName}</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{r.totalTokens.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">${r.costEstimate.toFixed(4)}</td>
                      <td className={`py-2.5 px-4 font-semibold ${st.tone}`}>{st.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
