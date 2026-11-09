'use client';

import React, { useState, useEffect } from 'react';
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
  ShieldAlert
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableRowSkeleton } from '@/components/ui/LoadingSkeleton';

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
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProject, setFilterProject] = useState(selectedProjectId || '');
  const [filterModel, setFilterModel] = useState('');
  const [filterAnomalyOnly, setFilterAnomalyOnly] = useState(false);
  const [filterBlockedOnly, setFilterBlockedOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const pageSize = 15;

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterProject) params.append('projectId', filterProject);
      if (filterModel) params.append('model', filterModel);
      if (filterAnomalyOnly) params.append('anomalyOnly', 'true');
      if (filterBlockedOnly) params.append('blockedOnly', 'true');
      
      const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
      const res = await fetch(`/api/v1/audit?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filterProject, filterModel, filterAnomalyOnly, filterBlockedOnly]);

  useEffect(() => {
    if (selectedProjectId) {
      setFilterProject(selectedProjectId);
    }
  }, [selectedProjectId]);

  const handleExportCsv = () => {
    const url = filterProject ? `/api/v1/audit/export?projectId=${filterProject}` : '/api/v1/audit/export';
    window.open(url, '_blank');
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
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#18191B] tracking-tight">
            Immutable Audit Trail & Ledger
          </h2>
          <p className="text-xs text-[#5F6368]">
            Append-only, cryptographically verifiable record of all proxied AI requests for FinOps attribution and compliance.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white hover:bg-[#F3F3F0] text-[#18191B] border border-[#E4E4E0] font-semibold text-xs shadow-xs transition-colors self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5 text-[#5F6368]" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3.5 rounded-xl border border-[#E4E4E0] shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#80868B]" />
            <input
              type="text"
              placeholder="Search request ID, model, user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-md border border-[#E4E4E0] text-xs text-[#18191B] focus:outline-none focus:border-[#FF6B35]"
            />
          </div>

          {/* Project Filter */}
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="px-2.5 py-1.5 rounded-md border border-[#E4E4E0] text-xs font-medium text-[#18191B] bg-white focus:outline-none focus:border-[#FF6B35]"
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
            className="px-2.5 py-1.5 rounded-md border border-[#E4E4E0] text-xs font-medium text-[#18191B] bg-white focus:outline-none focus:border-[#FF6B35]"
          >
            <option value="">All Models</option>
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-4o-mini">GPT-4o Mini</option>
            <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
            <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
          </select>
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer text-[#5F6368] hover:text-[#18191B]">
            <input
              type="checkbox"
              checked={filterAnomalyOnly}
              onChange={(e) => setFilterAnomalyOnly(e.target.checked)}
              className="rounded text-[#FF6B35]"
            />
            <span>Spikes Only</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer text-[#5F6368] hover:text-[#18191B]">
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
            className="p-1.5 rounded hover:bg-[#F3F3F0] text-[#5F6368]"
            title="Refresh logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Audit Log Table */}
      {isLoading ? (
        <div className="bg-white p-5 rounded-xl border border-[#E4E4E0] shadow-xs">
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
        <div className="bg-white rounded-xl border border-[#E4E4E0] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F3F3F0] text-[#5F6368] font-semibold border-b border-[#E4E4E0]">
                <tr>
                  <th className="py-2.5 px-3.5">Request ID</th>
                  <th className="py-2.5 px-3.5">Timestamp</th>
                  <th className="py-2.5 px-3.5">Project</th>
                  <th className="py-2.5 px-3.5">Model</th>
                  <th className="py-2.5 px-3.5 text-right">Tokens In / Out</th>
                  <th className="py-2.5 px-3.5 text-right">Cost (USD)</th>
                  <th className="py-2.5 px-3.5 text-right">Latency</th>
                  <th className="py-2.5 px-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E0] text-[#18191B]">
                {paginatedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#FBFBFA] transition-colors">
                    <td className="py-2.5 px-3.5 font-mono text-[11px] text-[#5F6368]">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[110px]">{log.id}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(log.id)}
                          className="text-[#80868B] hover:text-[#18191B]"
                          title="Copy Request ID"
                        >
                          {copiedId === log.id ? <Check className="w-3 h-3 text-[#0D9488]" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </td>

                    <td className="py-2.5 px-3.5 font-mono text-[11px] text-[#80868B]">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>

                    <td className="py-2.5 px-3.5 font-medium">
                      {log.projectName || log.projectId}
                    </td>

                    <td className="py-2.5 px-3.5">
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#F3F3F0] text-[#18191B] border border-[#E4E4E0]">
                        {log.model}
                      </span>
                    </td>

                    <td className="py-2.5 px-3.5 font-mono tabular-nums text-right text-[#5F6368]">
                      {log.tokensIn.toLocaleString()} / {log.tokensOut.toLocaleString()}
                    </td>

                    <td className="py-2.5 px-3.5 font-mono tabular-nums text-right font-semibold text-[#0D9488]">
                      ${Number(log.costEstimate).toFixed(5)}
                    </td>

                    <td className="py-2.5 px-3.5 font-mono tabular-nums text-right text-[#5F6368]">
                      {log.latencyMs}ms
                    </td>

                    <td className="py-2.5 px-3.5 text-center">
                      {log.isBlocked ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]">
                          <ShieldAlert className="w-3 h-3" />
                          <span>429 Blocked</span>
                        </span>
                      ) : log.isAnomaly ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]" title={log.anomalyReason}>
                          <AlertTriangle className="w-3 h-3" />
                          <span>Spike (Z&gt;3)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#F0FDF4] text-[#0D9488] border border-[#BBF7D0]">
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
          <div className="p-3 border-t border-[#E4E4E0] bg-[#FBFBFA] flex items-center justify-between text-xs text-[#5F6368]">
            <span className="font-mono tabular-nums">
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredLogs.length)} of {filteredLogs.length} records
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1 rounded border border-[#E4E4E0] bg-white disabled:opacity-40 hover:bg-[#F3F3F0]"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-mono tabular-nums text-[#18191B]">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1 rounded border border-[#E4E4E0] bg-white disabled:opacity-40 hover:bg-[#F3F3F0]"
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
