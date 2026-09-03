'use client';

import React, { useState } from 'react';
import { 
  Terminal, 
  Play, 
  Zap, 
  DollarSign, 
  Clock, 
  ShieldAlert, 
  ShieldCheck, 
  Sparkles, 
  Copy, 
  Check, 
  AlertTriangle,
  Flame,
  CheckCircle2
} from 'lucide-react';

interface PlaygroundViewProps {
  projects: Array<{ id: string; name: string; isBlocked?: boolean }>;
  onRefreshMetrics: () => void;
}

const TEMPLATES = [
  {
    title: '💬 Standard Customer Support',
    prompt: 'Summarize customer ticket #49102 regarding billing discrepancies and generate a polite resolution summary for the enterprise client.'
  },
  {
    title: '⚡ Code Refactoring (Fast)',
    prompt: 'Refactor this React hook to optimize memory consumption and prevent unnecessary component re-renders.'
  },
  {
    title: '🚨 High Token Spike (Triggers Anomaly)',
    prompt: 'Perform a comprehensive multi-page legal document synthesis with detailed clause-by-clause liability risk matrices for 15 enterprise SaaS vendor contracts with citations and remediation recommendations.'.repeat(10)
  }
];

export function PlaygroundView({ projects, onRefreshMetrics }: PlaygroundViewProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || 'proj_copilot');
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [prompt, setPrompt] = useState(TEMPLATES[0].prompt);
  const [isLoading, setIsLoading] = useState(false);
  const [isSimulatingLoad, setIsSimulatingLoad] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleExecute = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setExecutionResult(null);

    try {
      const res = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          project_id: selectedProjectId,
          model: selectedModel,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await res.json();
      const headers: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        if (key.toLowerCase().startsWith('x-spendguard')) {
          headers[key] = val;
        }
      });

      setExecutionResult({
        status: res.status,
        ok: res.ok,
        data,
        headers,
        timestamp: new Date().toLocaleTimeString()
      });

      onRefreshMetrics();
    } catch (err: any) {
      console.error('Playground execution failed:', err);
      setExecutionResult({
        status: 500,
        ok: false,
        data: { error: { message: err.message || 'Execution error' } },
        headers: {},
        timestamp: new Date().toLocaleTimeString()
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Simulate 5 rapid requests to demonstrate live spend progression
  const handleSimulateLoad = async () => {
    setIsSimulatingLoad(true);
    try {
      for (let i = 0; i < 4; i++) {
        await fetch('/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: selectedProjectId,
            model: selectedModel,
            messages: [{ role: 'user', content: `Automated test query #${i + 1}: ${prompt.slice(0, 100)}` }]
          })
        });
      }
      // Final run to display in UI
      await handleExecute();
    } catch (err) {
      console.error('Load test error:', err);
    } finally {
      setIsSimulatingLoad(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Gateway Test Bench & Playground</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Test prompt execution across multi-provider LLMs with real-time budget guardrail enforcement and cost calculation.
          </p>
        </div>

        <button
          onClick={handleSimulateLoad}
          disabled={isSimulatingLoad || isLoading}
          className="flex items-center space-x-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 font-semibold text-xs rounded-lg transition-all self-start sm:self-auto"
        >
          <Flame className={`w-4 h-4 ${isSimulatingLoad ? 'animate-bounce text-amber-400' : 'text-cyan-400'}`} />
          <span>{isSimulatingLoad ? 'Simulating 5 Calls...' : 'Simulate 5 Rapid Requests'}</span>
        </button>
      </div>

      {/* Main Playground Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Configuration & Prompt Editor (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="glass-card p-5 rounded-xl border border-slate-800 space-y-4">
            {/* Project & Model Selector Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Target Project Scope</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-medium cursor-pointer"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-900">
                      {p.isBlocked ? '🚫 [BLOCKED] ' : '📁 '} {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">AI Model Endpoint</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-cyan-400 font-mono font-bold focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <optgroup label="OpenAI Models">
                    <option value="gpt-4o">gpt-4o (Flagship)</option>
                    <option value="gpt-4o-mini">gpt-4o-mini (Lightweight)</option>
                    <option value="o1">o1 Reasoning</option>
                    <option value="o3-mini">o3-mini</option>
                  </optgroup>
                  <optgroup label="Anthropic Claude">
                    <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet</option>
                    <option value="claude-3-5-haiku-20241022">claude-3-5-haiku</option>
                  </optgroup>
                  <optgroup label="Google Gemini">
                    <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                    <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                  </optgroup>
                </select>
              </div>
            </div>

            {/* Quick Templates */}
            <div>
              <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">Preset Templates:</span>
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map((t, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPrompt(t.prompt)}
                    className="text-[11px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition-all text-left"
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt Editor */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-300">User Prompt Payload</label>
                <span className="text-[10px] text-slate-500 font-mono">{prompt.length} chars</span>
              </div>
              <textarea
                rows={6}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter prompt to execute through SpendGuard AI Gateway..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500 resize-none leading-relaxed"
              />
            </div>

            {/* Execution CTA Button */}
            <button
              onClick={handleExecute}
              disabled={isLoading || !prompt.trim()}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
            >
              <Play className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Executing Through SpendGuard Gateway...' : 'Execute Request via Gateway'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Real-time Telemetry & Response Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass-card p-5 rounded-xl border border-slate-800 flex flex-col justify-between min-h-[460px]">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <h3 className="font-bold text-white text-sm">Governance Telemetry</h3>
                </div>
                {executionResult && (
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                      executionResult.ok
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    HTTP {executionResult.status}
                  </span>
                )}
              </div>

              {/* Telemetry Stats Grid */}
              {executionResult && executionResult.ok && executionResult.data?.governance && (
                <div className="grid grid-cols-2 gap-2 my-4">
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 flex items-center space-x-1">
                      <DollarSign className="w-3 h-3 text-cyan-400" />
                      <span>Cost Estimate</span>
                    </span>
                    <p className="text-sm font-extrabold text-white font-mono mt-0.5">
                      ${Number(executionResult.data.governance.cost_estimate_usd).toFixed(6)}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-indigo-400" />
                      <span>Proxy Latency</span>
                    </span>
                    <p className="text-sm font-extrabold text-white font-mono mt-0.5">
                      {executionResult.data.governance.latency_ms} ms
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 flex items-center space-x-1">
                      <Zap className="w-3 h-3 text-emerald-400" />
                      <span>Total Tokens</span>
                    </span>
                    <p className="text-sm font-extrabold text-white font-mono mt-0.5">
                      {executionResult.data.usage?.total_tokens.toLocaleString()}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 flex items-center space-x-1">
                      <ShieldCheck className="w-3 h-3 text-purple-400" />
                      <span>Budget Left</span>
                    </span>
                    <p className="text-sm font-extrabold text-white font-mono mt-0.5">
                      ${executionResult.data.governance.budget_remaining_usd}
                    </p>
                  </div>
                </div>
              )}

              {/* Anomaly Badge if triggered */}
              {executionResult?.data?.governance?.is_anomaly && (
                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 mb-3 flex items-start space-x-2 text-xs text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Statistical Anomaly Triggered</span>
                    <span className="text-[11px] text-amber-200">
                      {executionResult.data.governance.anomaly_reason}
                    </span>
                  </div>
                </div>
              )}

              {/* Hard Block Error Response Display */}
              {executionResult && !executionResult.ok && (
                <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/70 my-3 text-xs space-y-2">
                  <div className="flex items-center space-x-2 text-rose-400 font-bold">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Guardrail Block Enforced</span>
                  </div>
                  <p className="text-rose-200 font-mono text-[11px]">
                    {executionResult.data?.error?.message}
                  </p>
                  {executionResult.data?.error?.guardrail && (
                    <div className="p-2.5 rounded bg-slate-900/90 border border-rose-900/60 font-mono text-[10px] text-slate-300 space-y-1">
                      <p>Project: {executionResult.data.error.guardrail.project}</p>
                      <p>Current Spend: ${executionResult.data.error.guardrail.current_spend}</p>
                      <p>Budget Cap: ${executionResult.data.error.guardrail.monthly_budget}</p>
                      <p className="text-rose-400 font-bold">Policy: Fail-Closed Protection Active</p>
                    </div>
                  )}
                </div>
              )}

              {/* Assistant Message Response Preview */}
              {executionResult && executionResult.ok && (
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-slate-400">Response Payload:</span>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {executionResult.data?.choices?.[0]?.message?.content}
                  </div>
                </div>
              )}

              {!executionResult && !isLoading && (
                <div className="py-16 text-center text-slate-500">
                  <Terminal className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-xs">Select model and hit Execute to inspect real-time governance headers.</p>
                </div>
              )}
            </div>

            {/* Custom Headers Inspector */}
            {executionResult?.headers && Object.keys(executionResult.headers).length > 0 && (
              <div className="pt-3 border-t border-slate-800 mt-4">
                <span className="text-[10px] font-mono text-slate-500 block mb-1">Custom Governance Headers:</span>
                <div className="p-2 rounded bg-slate-950 border border-slate-900 text-[10px] font-mono text-cyan-400 space-y-0.5">
                  {Object.entries(executionResult.headers).map(([k, v]) => (
                    <p key={k} className="truncate">
                      <span className="text-slate-500">{k}:</span> {String(v)}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
