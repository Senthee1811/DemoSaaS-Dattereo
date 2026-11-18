'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Download,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableRowSkeleton } from '@/components/ui/LoadingSkeleton';
import { authFetch, readApiError } from '@/lib/auth-fetch';

interface AuditLog {
  id: string;
  projectId: string;
  projectName?: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  costEstimate: number;
  latencyMs: number;
  statusCode: number;
  isAnomaly: boolean;
  anomalyReason?: string;
  isBlocked: boolean;
  promptPreview?: string;
  responsePreview?: string;
  timestamp: string;
}

interface AuditViewProps {
  projects: Array<{ id: string; name: string }>;
  selectedProjectId?: string;
}

export function AuditView({ projects, selectedProjectId }: AuditViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProject, setFilterProject] = useState(selectedProjectId || '');
  const [filterModel, setFilterModel] = useState('');
  const [filterAnomalyOnly, setFilterAnomalyOnly] = useState(false);
  const [filterBlockedOnly, setFilterBlockedOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const pageSize = 15;

  // Follow the project picked in the header (React's "adjust state on prop change" pattern)
  const [prevSelectedProjectId, setPrevSelectedProjectId] = useState(selectedProjectId);
  if (selectedProjectId !== prevSelectedProjectId) {
    setPrevSelectedProjectId(selectedProjectId);
    if (selectedProjectId) setFilterProject(selectedProjectId);
  }

  // Each load is keyed by its filters + a manual reload counter. "Loading" simply
  // means the result on screen belongs to a different key than the one requested.
  const [reloadCount, setReloadCount] = useState(0);
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filterProject) params.append('projectId', filterProject);
    if (filterModel) params.append('model', filterModel);
    if (filterAnomalyOnly) params.append('anomalyOnly', 'true');
    if (filterBlockedOnly) params.append('blockedOnly', 'true');
    return params.toString();
  }, [filterProject, filterModel, filterAnomalyOnly, filterBlockedOnly]);
  const requestKey = `${query}#${reloadCount}`;
  const [result, setResult] = useState<{ key: string; logs: AuditLog[] } | null>(null);
  const isLoading = result?.key !== requestKey;
  const logs = useMemo(() => result?.logs ?? [], [result]);

  useEffect(() => {
    let cancelled = false;
    authFetch(`/api/v1/audit?${query}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { logs?: AuditLog[] }) => data.logs || [])
      .catch((err): AuditLog[] => {
        console.error('Failed to fetch audit logs:', err);
        return [];
      })
      .then((fetched) => {
        if (!cancelled) setResult({ key: requestKey, logs: fetched });
      });
    return () => {
      cancelled = true;
    };
  }, [query, requestKey]);

  const fetchLogs = () => setReloadCount((n) => n + 1);

  const handleExportCsv = async () => {
    // Fetch with the session token (a plain link/window.open cannot send it), then download the blob
    const url = filterProject
      ? `/api/v1/audit/export?projectId=${encodeURIComponent(filterProject)}`
      : '/api/v1/audit/export';
    try {
      const res = await authFetch(url);
      if (!res.ok) {
        window.alert(await readApiError(res, 'Export failed. Please try again.'));
        return;
      }
      const blob = await res.blob();
      const match = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = match?.[1] || `spendguard-audit-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error('CSV export failed:', err);
      window.alert('Export failed. Please check your connection and try again.');
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredLogs = logs.filter(l => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      l.id.toLowerCase().includes(q) ||
      l.model.toLowerCase().includes(q) ||
      (l.projectName && l.projectName.toLowerCase().includes(q)) ||
      (l.userName && l.userName.toLowerCase().includes(q))
    );
  });

  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-normal text-inversion-dark tracking-tight">
            Immutable Audit Trail & Ledger
          </h2>
          <p className="text-xs text-sg-text-secondary mt-1">
            Append-only, cryptographically verifiable record of all proxied AI requests for FinOps attribution and compliance.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white hover:bg-[#F3F3F0] text-inversion-dark border border-sg-border font-semibold text-xs shadow-2xs transition-colors self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5 text-sg-text-secondary" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-3xl border border-sg-border shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-65">
          {/* Search */}
          <div className="relative flex-1 min-w-45 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-sg-text-muted" />
            <input
              type="text"
              placeholder="Search request ID, model, user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-2xl border border-sg-border text-xs text-inversion-dark focus:outline-none focus:border-[#FF6B35]"
            />
          </div>

          {/* Project Filter */}
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="px-3.5 py-2 rounded-full border border-sg-border text-xs font-medium text-inversion-dark bg-parchment-ivory focus:outline-none focus:border-[#FF6B35] cursor-pointer"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Model Filter */}
          <select
            value={filterModel}
            onChange={(e) => setFilterModel(e.target.value)}
            className="px-3.5 py-2 rounded-full border border-sg-border text-xs font-medium text-inversion-dark bg-parchment-ivory focus:outline-none focus:border-[#FF6B35] cursor-pointer"
          >
            <option value="">All Models</option>
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-4o-mini">GPT-4o Mini</option>
            <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
            <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
          </select>
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-3.5">
          <label className="flex items-center gap-1.5 cursor-pointer text-sg-text-secondary hover:text-inversion-dark">
            <input
              type="checkbox"
              checked={filterAnomalyOnly}
              onChange={(e) => setFilterAnomalyOnly(e.target.checked)}
              className="rounded text-[#FF6B35]"
            />
            <span>Spikes Only</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer text-sg-text-secondary hover:text-inversion-dark">
            <input
              type="checkbox"
              checked={filterBlockedOnly}
              onChange={(e) => setFilterBlockedOnly(e.target.checked)}
              className="rounded text-[#FF6B35]"
            />
            <span>Blocked Only</span>
          </label>

          <button
            type="button"
            onClick={fetchLogs}
            className="p-2 rounded-full hover:bg-[#F3F3F0] text-sg-text-secondary transition-colors"
            title="Refresh logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#FF6B35]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Audit Log Table */}
      {isLoading ? (
        <div className="bg-white p-6 rounded-3xl border border-sg-border shadow-2xs">
          <TableRowSkeleton count={8} />
        </div>
      ) : paginatedLogs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No audit entries found"
          description="Try broadening your project or model filters, or execute a request in the test bench."
          compact
        />
      ) : (
        <div className="bg-white rounded-3xl border border-sg-border shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-parchment-ivory text-sg-text-secondary font-semibold border-b border-sg-border">
                <tr>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Request ID</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Timestamp</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Project</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Model</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider text-right">Tokens In / Out</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider text-right">Cost (USD)</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider text-right">Latency</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sg-border text-inversion-dark">
                {paginatedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-parchment-ivory transition-colors">
                    <td className="py-3.5 px-4 font-mono text-[11px] text-sg-text-secondary">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-27.5">{log.id}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(log.id)}
                          className="text-sg-text-muted hover:text-inversion-dark p-0.5 rounded transition-colors"
                          title="Copy Request ID"
                        >
                          {copiedId === log.id ? <Check className="w-3 h-3 text-[#0D9488]" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[11px] text-sg-text-muted">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>

                    <td className="py-3.5 px-4 font-medium">
                      {log.projectName || log.projectId}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-mono text-[11px] px-2.5 py-0.5 rounded-full bg-[#F3F3F0] text-inversion-dark border border-sg-border">
                        {log.model}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono tabular-nums text-right text-sg-text-secondary">
                      {log.tokensIn.toLocaleString()} / {log.tokensOut.toLocaleString()}
                    </td>

                    <td className="py-3.5 px-4 font-mono tabular-nums text-right font-semibold text-[#0D9488]">
                      ${Number(log.costEstimate).toFixed(5)}
                    </td>

                    <td className="py-3.5 px-4 font-mono tabular-nums text-right text-sg-text-secondary">
                      {log.latencyMs}ms
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {log.isBlocked ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-sg-critical-bg text-sg-critical border border-sg-critical-border">
                          <ShieldAlert className="w-3 h-3" />
                          <span>429 Blocked</span>
                        </span>
                      ) : log.isAnomaly ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-sg-warning-bg text-sg-warning border border-sg-warning-border" title={log.anomalyReason}>
                          <AlertTriangle className="w-3 h-3" />
                          <span>Spike (Z&gt;3)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-sg-success-bg text-[#0D9488] border border-sg-success-border">
                          <ShieldCheck className="w-3 h-3" />
                          <span>200 OK</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-4 border-t border-sg-border bg-parchment-ivory flex items-center justify-between text-xs text-sg-text-secondary">
            <span className="font-mono tabular-nums">
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredLogs.length)} of {filteredLogs.length} records
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-full border border-sg-border bg-white disabled:opacity-40 hover:bg-[#F3F3F0] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 font-mono tabular-nums text-inversion-dark font-medium">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-full border border-sg-border bg-white disabled:opacity-40 hover:bg-[#F3F3F0] transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
