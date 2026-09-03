'use client';

import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Download, 
  Search, 
  Filter, 
  AlertTriangle, 
  ShieldX, 
  CheckCircle2, 
  ExternalLink,
  Calendar,
  X
} from 'lucide-react';

interface AuditViewProps {
  projects: Array<{ id: string; name: string }>;
  selectedProjectId: string;
}

export function AuditView({ projects, selectedProjectId }: AuditViewProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'ANOMALIES' | 'BLOCKED'>('ALL');
  const [filterProject, setFilterProject] = useState(selectedProjectId || '');
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const url = `/api/v1/analytics${filterProject ? `?projectId=${filterProject}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      setLogs(data.recentRequests || []);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filterProject]);

  useEffect(() => {
    if (selectedProjectId) {
      setFilterProject(selectedProjectId);
    }
  }, [selectedProjectId]);

  const handleExportCsv = () => {
    const url = `/api/v1/audit/export${filterProject ? `?projectId=${filterProject}` : ''}`;
    window.open(url, '_blank');
  };

  const filteredLogs = logs.filter((l) => {
    if (filterType === 'ANOMALIES' && !l.isAnomaly) return false;
    if (filterType === 'BLOCKED' && !l.isBlocked) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      const matchModel = l.model.toLowerCase().includes(s);
      const matchUser = (l.userName || '').toLowerCase().includes(s);
      const matchPrompt = (l.promptPreview || '').toLowerCase().includes(s);
      const matchProject = (l.projectName || '').toLowerCase().includes(s);
      return matchModel || matchUser || matchPrompt || matchProject;
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Immutable Audit Ledger & Compliance</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Tamper-proof record of every AI request, token consumption, cost estimate, and security guardrail evaluation.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="flex items-center space-x-2 px-3.5 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold text-xs rounded-lg shadow-sm shadow-cyan-500/20 transition-all self-start sm:self-auto"
        >
          <Download className="w-4 h-4" />
          <span>Export Compliance CSV</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-card p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by model, user, prompt text..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          {/* Project Filter */}
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Status Filter Tabs */}
          <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1 rounded font-medium transition-all ${
                filterType === 'ALL' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400'
              }`}
            >
              All ({logs.length})
            </button>
            <button
              onClick={() => setFilterType('ANOMALIES')}
              className={`px-3 py-1 rounded font-medium transition-all ${
                filterType === 'ANOMALIES' ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-slate-400'
              }`}
            >
              Anomalies
            </button>
            <button
              onClick={() => setFilterType('BLOCKED')}
              className={`px-3 py-1 rounded font-medium transition-all ${
                filterType === 'BLOCKED' ? 'bg-rose-500/20 text-rose-300 font-semibold' : 'text-slate-400'
              }`}
            >
              Blocked
            </button>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="glass-card rounded-xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Project</th>
                <th className="py-3 px-4">Model</th>
                <th className="py-3 px-4">Prompt Preview</th>
                <th className="py-3 px-4 text-right">Tokens</th>
                <th className="py-3 px-4 text-right">Cost (USD)</th>
                <th className="py-3 px-4 text-right">Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {filteredLogs.map((log) => (
                <tr
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4">
                    {log.isBlocked ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        BLOCKED
                      </span>
                    ) : log.isAnomaly ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        ANOMALY
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-mono">
                        200 OK
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-white font-semibold whitespace-nowrap">
                    {log.projectName}
                  </td>
                  <td className="py-3 px-4 font-mono text-cyan-400 whitespace-nowrap">
                    {log.model}
                  </td>
                  <td className="py-3 px-4 text-slate-400 max-w-xs truncate">
                    {log.promptPreview || 'Payload logged'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                    {(Number(log.totalTokens ?? log.total_tokens ?? 0)).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-white whitespace-nowrap">
                    ${Number(log.costEstimate).toFixed(6)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-400 whitespace-nowrap">
                    {log.latencyMs}ms
                  </td>
                </tr>
              ))}

              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No log records match your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-2xl w-full p-6 rounded-2xl border border-slate-700 shadow-2xl relative max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div>
                <h3 className="font-bold text-white text-base">Request Audit Record</h3>
                <p className="text-xs text-slate-400 font-mono">{selectedLog.id}</p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Status Header Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">HTTP Status</span>
                  <span className="font-bold text-white text-sm">{selectedLog.statusCode}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Exact Cost</span>
                  <span className="font-bold text-cyan-400 text-sm font-mono">${Number(selectedLog.costEstimate).toFixed(6)}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Total Tokens</span>
                  <span className="font-bold text-white text-sm">{(Number(selectedLog.totalTokens ?? selectedLog.total_tokens ?? 0)).toLocaleString()}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Latency</span>
                  <span className="font-bold text-white text-sm">{selectedLog.latencyMs} ms</span>
                </div>
              </div>

              {/* Anomaly banner if present */}
              {selectedLog.isAnomaly && (
                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-300">
                  <span className="font-bold block">⚠️ Anomaly Spike Tag:</span>
                  <span className="text-[11px]">{selectedLog.anomalyReason}</span>
                </div>
              )}

              {/* Metadata Details */}
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Project:</span>
                  <span className="text-white font-semibold">{selectedLog.projectName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">AI Model:</span>
                  <span className="text-cyan-400 font-mono">{selectedLog.model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Timestamp:</span>
                  <span className="text-slate-200 font-mono">{new Date(selectedLog.timestamp).toISOString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Prompt Tokens / Completion Tokens:</span>
                  <span className="text-slate-200 font-mono">{selectedLog.tokensIn} in / {selectedLog.tokensOut} out</span>
                </div>
              </div>

              {/* Prompt Text */}
              <div>
                <span className="text-[11px] font-semibold text-slate-300 block mb-1">Captured Prompt Payload:</span>
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg font-mono text-slate-300 max-h-32 overflow-y-auto whitespace-pre-wrap">
                  {selectedLog.promptPreview || 'None'}
                </div>
              </div>

              {/* Response Text */}
              <div>
                <span className="text-[11px] font-semibold text-slate-300 block mb-1">Model Response:</span>
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg font-mono text-slate-300 max-h-32 overflow-y-auto whitespace-pre-wrap">
                  {selectedLog.responsePreview || 'None'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
