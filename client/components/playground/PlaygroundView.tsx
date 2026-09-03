'use client';

import React, { useState } from 'react';
import { 
  Play, 
  Terminal, 
  Cpu, 
  Layers, 
  Clock, 
  DollarSign, 
  CheckCircle2, 
  ShieldAlert, 
  ShieldCheck, 
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Zap,
  Lock
} from 'lucide-react';

interface PlaygroundViewProps {
  projects: Array<{ id: string; name: string }>;
  onRefreshMetrics: () => void;
}

const MODELS = [
  { id: 'gpt-4o', name: 'OpenAI GPT-4o', provider: 'OPENAI', inCost: 2.50, outCost: 10.00 },
  { id: 'gpt-4o-mini', name: 'OpenAI GPT-4o Mini', provider: 'OPENAI', inCost: 0.15, outCost: 0.60 },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'ANTHROPIC', inCost: 3.00, outCost: 15.00 },
  { id: 'gemini-1.5-pro', name: 'Google Gemini 1.5 Pro', provider: 'GEMINI', inCost: 1.25, outCost: 5.00 },
  { id: 'gemini-1.5-flash', name: 'Google Gemini 1.5 Flash', provider: 'GEMINI', inCost: 0.075, outCost: 0.30 },
];

export function PlaygroundView({ projects, onRefreshMetrics }: PlaygroundViewProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || 'proj_copilot');
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [prompt, setPrompt] = useState('Generate a concise spend analysis summary for our Q3 multi-model AI infrastructure.');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1000);
  const [isLoading, setIsLoading] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleExecuteRequest = async () => {
    if (!prompt) return;
    setIsLoading(true);
    setExecutionResult(null);
    try {
      const res = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          model: selectedModel,
          messages: [{ role: 'user', content: prompt }],
          temperature,
          maxTokens
        })
      });

      const data = await res.json();
      setExecutionResult({
        status: res.status,
        headers: {
          'x-spendguard-cost': res.headers.get('x-spendguard-cost'),
          'x-spendguard-latency': res.headers.get('x-spendguard-latency'),
          'x-spendguard-blocked': res.headers.get('x-spendguard-blocked'),
        },
        data
      });
      onRefreshMetrics();
    } catch (err: any) {
      setExecutionResult({
        status: 500,
        data: { error: { message: err.message || 'Failed to connect to gateway' } }
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySnippet = () => {
    const code = `curl -X POST https://gateway.spendguard.ai/v1/chat/completions \\
  -H "Authorization: Bearer spnd_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${selectedModel}", "messages": [{"role": "user", "content": "${prompt.slice(0, 40)}..."}]}'`;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#111111] tracking-tight">
            Gateway Test Bench & Sandbox
          </h2>
          <p className="text-xs sm:text-sm text-[#666666] mt-0.5">
            Test multi-model inference through the proxy with live token metering and guardrail enforcement.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCopySnippet}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#E8E8E8] text-xs font-semibold text-[#111111] hover:bg-[#FFF8F5] transition-all"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#FF6B35]" />}
          <span>Copy cURL</span>
        </button>
      </div>

      {/* Main Sandbox Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Config Panel (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-6 sm:p-7 border border-[#E8E8E8] shadow-sm space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1.5">
                Target Project & Budget Scope
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E8E8] text-xs font-semibold text-[#111111] bg-[#FFF8F5] focus:outline-none focus:border-[#FF6B35]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    📁 {p.name} ({p.id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1.5">
                Model & Provider Adapter
              </label>
              <div className="space-y-1.5">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedModel(m.id)}
                    className={`w-full p-3 rounded-2xl border text-left text-xs transition-all flex items-center justify-between ${
                      selectedModel === m.id
                        ? 'bg-[#FFF1EA] border-[#FF6B35] text-[#111111] shadow-sm ring-1 ring-[#FF6B35]'
                        : 'bg-white border-[#E8E8E8] text-[#555555] hover:border-[#CCCCCC]'
                    }`}
                  >
                    <div>
                      <div className="font-bold">{m.name}</div>
                      <div className="text-[10.5px] text-[#777777] mt-0.5">
                        ${m.inCost} / ${m.outCost} per 1M tokens
                      </div>
                    </div>
                    <span className="font-mono text-[10px] uppercase font-bold text-[#FF6B35] bg-white px-2 py-0.5 rounded-md border border-[#FFD9C7]">
                      {m.provider}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1.5">
                Test Prompt Payload
              </label>
              <textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full p-3.5 rounded-2xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35]"
                placeholder="Type a test inference query..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-xs text-[#666666] mb-1">
                  <span>Temperature</span>
                  <span className="font-mono text-[#111111]">{temperature}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  className="w-full accent-[#FF6B35]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-[#666666] mb-1">
                  <span>Max Tokens</span>
                  <span className="font-mono text-[#111111]">{maxTokens}</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="4000"
                  step="100"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                  className="w-full accent-[#FF6B35]"
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExecuteRequest}
            disabled={isLoading || !prompt}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] text-white font-bold text-xs shadow-sm shadow-[#FF6B35]/30 hover:shadow-md hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Executing Proxy Pipeline...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Send Request Via SpendGuard</span>
              </>
            )}
          </button>
        </div>

        {/* Right Output & Telemetry Panel (7 cols) */}
        <div className="lg:col-span-7 bg-[#111111] rounded-3xl p-6 sm:p-7 text-white flex flex-col justify-between shadow-lg">
          <div>
            {/* Top Bar */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                <span className="ml-2 font-mono text-xs text-white/50">gateway.spendguard.ai:443</span>
              </div>

              {executionResult && (
                <div className="flex items-center gap-2">
                  {executionResult.status === 200 ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold border border-emerald-500/30">
                      HTTP 200 OK
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-mono text-xs font-bold border border-red-500/30">
                      HTTP {executionResult.status} BLOCKED
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Metrics Breakdown if executed */}
            {executionResult?.data?.governance && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5">
                <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10">
                  <div className="text-[10px] text-white/50 uppercase font-mono">Calculated Cost</div>
                  <div className="text-xs font-bold text-emerald-400 mt-1 font-mono">
                    ${Number(executionResult.data.governance.cost_estimate_usd || 0).toFixed(6)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10">
                  <div className="text-[10px] text-white/50 uppercase font-mono">Total Tokens</div>
                  <div className="text-xs font-bold text-[#FFA06E] mt-1 font-mono">
                    {executionResult.data.usage?.total_tokens || 0}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10">
                  <div className="text-[10px] text-white/50 uppercase font-mono">Gateway Latency</div>
                  <div className="text-xs font-bold text-white mt-1 font-mono">
                    {executionResult.data.governance.latency_ms}ms
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10">
                  <div className="text-[10px] text-white/50 uppercase font-mono">Budget Remaining</div>
                  <div className="text-xs font-bold text-white mt-1 font-mono">
                    ${executionResult.data.governance.budget_remaining_usd}
                  </div>
                </div>
              </div>
            )}

            {/* Response Content or Error */}
            <div className="mt-4">
              <div className="text-xs font-bold uppercase tracking-wider text-white/40 mb-2 font-mono">
                Response Payload
              </div>

              {isLoading ? (
                <div className="p-8 text-center text-white/40 font-mono text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#FF6B35]" />
                  <span>Intercepting request and checking pre-flight guardrails...</span>
                </div>
              ) : executionResult ? (
                executionResult.data.error ? (
                  <div className="p-4 rounded-2xl bg-red-950/50 border border-red-800 text-red-300 font-mono text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-red-400">
                      <ShieldAlert className="w-4 h-4" />
                      <span>{executionResult.data.error.code || 'Guardrail Block'}</span>
                    </div>
                    <div>{executionResult.data.error.message}</div>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-black/60 border border-white/10 font-mono text-xs text-white/90 whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed">
                    {executionResult.data.choices?.[0]?.message?.content || JSON.stringify(executionResult.data, null, 2)}
                  </div>
                )
              ) : (
                <div className="p-12 text-center text-white/30 font-mono text-xs rounded-2xl border border-dashed border-white/10">
                  Click "Send Request" to execute a test call through the SpendGuard AI proxy.
                </div>
              )}
            </div>
          </div>

          {/* Footer Info */}
          <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-white/40">
            <span className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#FF6B35]" />
              Zero prompt retention policy
            </span>
            <span className="font-mono text-[#FF8A4C]">SpendGuard Gateway v2.4</span>
          </div>
        </div>

      </div>
    </div>
  );
}
