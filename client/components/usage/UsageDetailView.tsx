'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Loader2, ScrollText, FolderKanban } from 'lucide-react';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { errorMessage } from '@/lib/types';
import { auditFiltersFor, type UsageTarget } from '@/lib/usage-route';
import { EmptyState } from '@/components/ui/EmptyState';
import { InlineAlert, Spinner } from '@/components/ui/feedback';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { Badge } from '@/components/ui/Badge';

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

export const USAGE_PAGE_SIZE = 50;

function statusOf(r: AuditRow): { text: string; tone: 'critical' | 'warning' | 'success' } {
  if (r.isBlocked) return { text: 'Blocked', tone: 'critical' };
  if (r.statusCode >= 400) return { text: `Error ${r.statusCode}`, tone: 'critical' };
  if (r.isAnomaly) return { text: 'Anomaly', tone: 'warning' };
  return { text: 'OK', tone: 'success' };
}

const utc = (iso: string) => `${new Date(iso).toISOString().slice(0, 10)} ${new Date(iso).toISOString().slice(11, 19)}`;

/**
 * The detailed usage page behind BOTH dashboard charts: the individual requests (from
 * GET /api/v1/audit) for one chart bucket, in one project or across all of them. Which chart sent
 * you here only changes `target` (a UTC day, or a model); the page, states and table are shared.
 */
export function UsageDetailView({ scopeId, target }: { scopeId: string; target: UsageTarget }) {
  const filtersKey = JSON.stringify(auditFiltersFor(target));
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [projectMissing, setProjectMissing] = useState(false);

  const loadError =
    target.metric === 'daily' ? 'Could not load requests for this day.' : 'Could not load requests for this model.';

  const fetchPage = useCallback(
    async (offset: number): Promise<AuditPage> => {
      const qs = new URLSearchParams({
        ...(JSON.parse(filtersKey) as Record<string, string>),
        limit: String(USAGE_PAGE_SIZE),
        offset: String(offset),
      });
      if (scopeId) qs.set('projectId', scopeId);
      const res = await authFetch(`/api/v1/audit?${qs.toString()}`);
      if (!res.ok) throw new Error(await readApiError(res, loadError));
      return (await res.json()) as AuditPage;
    },
    [filtersKey, scopeId, loadError],
  );

  // First page (and again on retry)
  useEffect(() => {
    let cancelled = false;
    fetchPage(0)
      .then((data) => {
        if (cancelled) return;
        setRows(data.logs ?? []);
        setTotal(data.total ?? data.logs?.length ?? 0);
        setError(null);
        setLoaded(true);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage, attempt, loadError]);

  // The project's name for the header (the id alone means nothing to a person)
  useEffect(() => {
    if (!scopeId) return;
    let cancelled = false;
    authFetch('/api/v1/projects')
      .then(async (res) => (res.ok ? ((await res.json()) as { projects?: Array<{ id: string; name: string }> }) : null))
      .then((data) => {
        if (cancelled || !data) return;
        const found = data.projects?.find((p) => p.id === scopeId);
        if (found) setProjectName(found.name);
        else setProjectMissing(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [scopeId]);

  const retry = () => {
    setLoaded(false);
    setError(null);
    setAttempt((n) => n + 1);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await fetchPage(rows.length);
      setRows((prev) => [...prev, ...(data.logs ?? [])]);
      setTotal(data.total ?? total);
    } catch (err) {
      setError(errorMessage(err, loadError));
    } finally {
      setLoadingMore(false);
    }
  };

  const title =
    target.metric === 'daily' ? (
      <>
        Requests on {target.day} <span className="text-xs font-mono text-fg-muted">UTC</span>
      </>
    ) : (
      <>
        Requests for <span className="font-mono text-xl">{target.model}</span>
      </>
    );
  const crumb = target.metric === 'daily' ? target.day : target.model;
  const scopeLabel = scopeId ? (projectName ?? 'Selected project') : 'All projects';
  const spend = rows.reduce((sum, r) => sum + (r.isBlocked ? 0 : r.costEstimate), 0);
  const isLoading = !loaded && error === null;

  return (
    <div className="min-h-screen bg-surface-subtle text-fg">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Back + breadcrumb (same pill pattern as the Settings header) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <nav aria-label="Breadcrumb" className="inline-flex items-center gap-1.5 text-caption font-mono font-medium text-fg-secondary">
            <Link href="/dashboard" className="hover:text-fg hover:underline">
              Dashboard
            </Link>
            <ChevronRight className="w-3 h-3 text-fg-muted" aria-hidden />
            <span>Usage detail</span>
            <ChevronRight className="w-3 h-3 text-fg-muted" aria-hidden />
            <span aria-current="page" className="text-fg max-w-56 truncate" title={crumb}>
              {crumb}
            </span>
          </nav>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 self-start px-4 py-2 rounded-full bg-surface hover:bg-surface-muted border border-line text-xs font-semibold text-fg shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
            <span>Back to dashboard</span>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-line pb-4">
          <div className="min-w-0">
            <h1 className="font-serif text-2xl font-normal text-fg tracking-tight wrap-break-word">{title}</h1>
            {loaded && (
              <p className="text-xs text-fg-secondary mt-0.5">
                {total} request{total === 1 ? '' : 's'}
                {rows.length > 0 && <> · ${spend.toFixed(4)} spent{total > rows.length ? ` (first ${rows.length})` : ''}</>}
              </p>
            )}
          </div>
          <Badge tone="neutral" icon={FolderKanban} title={`Scope: ${scopeLabel}`} className="max-w-64 self-start sm:self-auto">
            {scopeLabel}
          </Badge>
        </div>

        {projectMissing && (
          <InlineAlert variant="warning" title="This project no longer exists">
            No requests can be shown for it. Go back to the dashboard and pick another project in Scope.
          </InlineAlert>
        )}

        <div className="bg-surface rounded-card border border-line shadow-2xs overflow-hidden">
          {isLoading && (
            <div className="p-10 flex items-center justify-center gap-2 text-xs text-fg-secondary" role="status">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              <span>Loading requests…</span>
            </div>
          )}

          {error && (
            <div className="p-6 space-y-3">
              <InlineAlert variant="error" title={error} />
              <button
                type="button"
                onClick={retry}
                className="px-4 py-1.5 rounded-full bg-surface hover:bg-surface-muted border border-line text-xs font-semibold"
              >
                Try again
              </button>
            </div>
          )}

          {loaded && !error && rows.length === 0 && (
            <div className="p-6">
              <EmptyState
                icon={ScrollText}
                title={target.metric === 'daily' ? 'No requests on this day' : 'No requests for this model'}
                description={
                  target.metric === 'daily'
                    ? 'Nothing went through the gateway during this UTC day.'
                    : 'No gateway requests were recorded for this model.'
                }
                compact
              />
            </div>
          )}

          {loaded && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-subtle text-fg-secondary border-b border-line">
                  <tr>
                    <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Time (UTC)</th>
                    <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Model</th>
                    <th className="py-3 px-4 font-mono text-label uppercase tracking-wider text-right">Tokens</th>
                    <th className="py-3 px-4 font-mono text-label uppercase tracking-wider text-right">Cost</th>
                    <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => {
                    const st = statusOf(r);
                    return (
                      <tr key={r.id} className="hover:bg-surface-subtle">
                        <td className="py-3 px-4 font-mono tabular-nums text-fg-secondary whitespace-nowrap" title={r.timestamp}>
                          {utc(r.timestamp)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1.5 font-medium text-fg">
                            <ProviderLogo provider={r.provider} size={14} />
                            {r.model}
                          </span>
                          {r.projectName && <span className="block text-label text-fg-muted">{r.projectName}</span>}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{r.totalTokens.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">${r.costEstimate.toFixed(4)}</td>
                        <td className="py-3 px-4">
                          <Badge tone={st.tone}>{st.text}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {loaded && rows.length > 0 && total > rows.length && (
            <div className="p-4 border-t border-line flex items-center justify-between gap-3 text-xs text-fg-secondary">
              <span>
                Showing {rows.length} of {total}
              </span>
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface hover:bg-surface-muted border border-line font-semibold text-fg disabled:opacity-50"
              >
                {loadingMore && <Spinner />}
                <span>{loadingMore ? 'Loading…' : 'Load more'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
