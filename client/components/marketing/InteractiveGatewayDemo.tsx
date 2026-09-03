'use client';

import React, { useState } from 'react';
import { 
  Play, 
  ShieldCheck, 
  ShieldAlert, 
  Cpu, 
  Layers, 
  Clock, 
  DollarSign, 
  CheckCircle2, 
  Sparkles,
  ArrowRight,
  Lock,
  Zap,
  RefreshCw
} from 'lucide-react';

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  providerColor: string;
  inCost: number; // per 1M
  outCost: number; // per 1M
}

const MODELS: ModelOption[] = [
  { id: 'gpt-4o', name: 'OpenAI GPT-4o', provider: 'OpenAI', providerColor: '#10A37F', inCost: 2.50, outCost: 10.00 },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', providerColor: '#D97706', inCost: 3.00, outCost: 15.00 },
  { id: 'gemini-1-5-pro', name: 'Gemini 1.5 Pro', provider: 'Google', providerColor: '#4285F4', inCost: 1.25, outCost: 5.00 },
  { id: 'gpt-4o-mini', name: 'OpenAI GPT-4o Mini', provider: 'OpenAI', providerColor: '#10A37F', inCost: 0.15, outCost: 0.60 },
];

const PROJECTS = [
  { id: 'proj_copilot', name: 'Customer Copilot', budget: 3500, currentSpend: 2140, isBlocked: false },
  { id: 'proj_marketing', name: 'Marketing AI Ops', budget: 5000, currentSpend: 4950, isBlocked: false },
  { id: 'proj_payments', name: 'Payments Auto-Review', budget: 2000, currentSpend: 2050, isBlocked: true },
];

export function InteractiveGatewayDemo() {
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [selectedProject, setSelectedProject] = useState(PROJECTS[0]);
  const [tokenLength, setTokenLength] = useState(1450);
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    status: number;
    tokensIn: number;
    tokensOut: number;
    cost: number;
    blocked: boolean;
    reason?: string;
    latencyMs: number;
  } | null>({
    status: 200,
    tokensIn: 850,
    tokensOut: 600,
    cost: 0.008125,
    blocked: false,
    latencyMs: 74,
  });

  const handleExecute = () => {
    setIsExecuting(true);
    setTimeout(() => {
      const isProjectOverBudget = selectedProject.currentSpend >= selectedProject.budget;
      const tokensIn = Math.floor(tokenLength * 0.6);
      const tokensOut = Math.floor(tokenLength * 0.4);
      const cost = (tokensIn / 1_000_000) * selectedModel.inCost + (tokensOut / 1_000_000) * selectedModel.outCost;

      if (isProjectOverBudget || selectedProject.isBlocked) {
        setLastResult({
          status: 429,
          tokensIn: 0,
          tokensOut: 0,
          cost: 0,
          blocked: true,
          reason: `Project budget of $${selectedProject.budget.toLocaleString()} reached. Hard-block guardrail activated.`,
          latencyMs: 12,
        });
      } else {
        setLastResult({
          status: 200,
          tokensIn,
          tokensOut,
          cost,
          blocked: false,
          latencyMs: Math.floor(Math.random() * 40 + 55),
        });
      }
      setIsExecuting(false);
    }, 450);
  };

  return (
    <section id="how-it-works" className="w-full py-16 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      {/* Section Header */}
      <div className="text-center max-w-2xl mx-auto mb-12">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF1EA] border border-[#FFD9C7] text-xs font-semibold text-[#FF6B35] mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Interactive Sandbox</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#111111]">
          Test Gateway Routing & Guardrails in Action
        </h2>
        <p className="mt-3 text-base text-[#666666]">
          See how SpendGuard intercepts every LLM call, computes live costs across providers, and enforces fail-closed budget caps in milliseconds.
        </p>
      </div>

      {/* Sandbox Workspace Card */}
      <div className="bg-white rounded-[32px] border border-[#E8E8E8] shadow-[0_20px_50px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          
          {/* Controls Panel (5 cols) */}
          <div className="lg:col-span-5 p-6 sm:p-8 bg-[#FAFAFA] border-b lg:border-b-0 lg:border-r border-[#E8E8E8] flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#777777] block mb-2">
                  1. Select LLM Provider & Model
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {MODELS.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setSelectedModel(model)}
                      className={`p-3 rounded-2xl text-left border text-xs transition-all ${
                        selectedModel.id === model.id
                          ? 'bg-white border-[#FF6B35] shadow-[0_4px_12px_rgba(255,107,53,0.15)] ring-1 ring-[#FF6B35]'
                          : 'bg-white/80 border-[#E8E8E8] hover:border-[#CCCCCC]'
                      }`}
                    >
                      <div className="font-bold text-[#111111]">{model.name}</div>
                      <div className="text-[10px] text-[#777777] mt-0.5">
                        ${model.inCost} / ${model.outCost} per 1M
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#777777] block mb-2">
                  2. Select Team Project & Budget
                </label>
                <div className="space-y-2">
                  {PROJECTS.map((proj) => {
                    const percent = Math.min(100, Math.round((proj.currentSpend / proj.budget) * 100));
                    return (
                      <button
                        key={proj.id}
                        type="button"
                        onClick={() => setSelectedProject(proj)}
                        className={`w-full p-3 rounded-2xl text-left border transition-all ${
                          selectedProject.id === proj.id
                            ? 'bg-white border-[#FF6B35] shadow-sm ring-1 ring-[#FF6B35]'
                            : 'bg-white/80 border-[#E8E8E8] hover:border-[#CCCCCC]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[#111111]">{proj.name}</span>
                          <span className={`text-[11px] font-semibold ${percent >= 100 ? 'text-red-500' : percent >= 80 ? 'text-amber-500' : 'text-emerald-600'}`}>
                            ${proj.currentSpend.toLocaleString()} / ${proj.budget.toLocaleString()} ({percent}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-[#EEEEEE] rounded-full mt-2 overflow-hidden">
                          <div
                            style={{ width: `${percent}%` }}
                            className={`h-full rounded-full ${
                              percent >= 100 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold uppercase tracking-wider text-[#777777]">
                    Simulated Payload Length
                  </span>
                  <span className="font-mono text-[#FF6B35] font-semibold">
                    ~{tokenLength.toLocaleString()} tokens
                  </span>
                </div>
                <input
                  type="range"
                  min="300"
                  max="8000"
                  step="100"
                  value={tokenLength}
                  onChange={(e) => setTokenLength(Number(e.target.value))}
                  className="w-full accent-[#FF6B35] cursor-pointer"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleExecute}
              disabled={isExecuting}
              className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] text-white font-bold text-sm shadow-[0_6px_18px_rgba(255,107,53,0.3)] hover:shadow-[0_8px_24px_rgba(255,107,53,0.4)] hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2"
            >
              {isExecuting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Intercepting & Auditing...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Send Request Through Gateway</span>
                </>
              )}
            </button>
          </div>

          {/* Real-time Response & Audit Stream (7 cols) */}
          <div className="lg:col-span-7 p-6 sm:p-8 bg-[#111111] text-white flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                  <span className="ml-2 text-xs font-mono text-white/50">spendguard-proxy:443</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-[#FF8A4C]">
                    Proxy Overhead: {lastResult?.latencyMs || 68}ms
                  </span>
                </div>
              </div>

              {/* Status Header */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {lastResult?.blocked ? (
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-bold font-mono">
                    <ShieldAlert className="w-4 h-4" />
                    <span>HTTP 429 HARD-BLOCKED (BUDGET EXCEEDED)</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-bold font-mono">
                    <ShieldCheck className="w-4 h-4" />
                    <span>HTTP 200 OK (POLICY APPROVED)</span>
                  </div>
                )}
              </div>

              {/* Telemetry Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10">
                  <div className="text-[10px] text-white/50 uppercase font-mono">Target Model</div>
                  <div className="text-xs font-bold text-white mt-1 truncate">{selectedModel.name}</div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10">
                  <div className="text-[10px] text-white/50 uppercase font-mono">Total Tokens</div>
                  <div className="text-xs font-bold text-[#FFA06E] mt-1 font-mono">
                    {lastResult?.blocked ? '0' : (lastResult?.tokensIn! + lastResult?.tokensOut!).toLocaleString()}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10">
                  <div className="text-[10px] text-white/50 uppercase font-mono">Cost Incurred</div>
                  <div className="text-xs font-bold text-emerald-400 mt-1 font-mono">
                    {lastResult?.blocked ? '$0.000000' : `$${lastResult?.cost.toFixed(6)}`}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10">
                  <div className="text-[10px] text-white/50 uppercase font-mono">Audit Record</div>
                  <div className="text-xs font-bold text-white/90 mt-1 font-mono flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#FF6B35]" />
                    <span>Immutable</span>
                  </div>
                </div>
              </div>

              {/* Terminal Code Log */}
              <div className="mt-6 p-4 rounded-xl bg-black/60 border border-white/10 font-mono text-[11.5px] leading-relaxed text-white/80 overflow-x-auto">
                <div className="text-white/40">// SpendGuard Gateway Intercept Log</div>
                <div className="text-[#FF8A4C]">POST /v1/chat/completions HTTP/1.1</div>
                <div>Host: gateway.spendguard.ai</div>
                <div>X-SpendGuard-Project: {selectedProject.id}</div>
                <div>X-SpendGuard-Model: {selectedModel.id}</div>
                <div className="mt-2 text-white/50">// Audit Check Result:</div>
                {lastResult?.blocked ? (
                  <div className="text-red-400">
                    &gt; FAIL-CLOSED ENFORCEMENT: {lastResult.reason}
                  </div>
                ) : (
                  <div className="text-emerald-400">
                    &gt; Budget check passed. Scoped API key dynamically injected and routed.
                  </div>
                )}
              </div>
            </div>

            {/* Bottom info banner */}
            <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-white/50">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#FF6B35]" />
                Zero Prompt Stored · AES-256 Key Vault
              </span>
              <span className="text-[#FF8A4C] font-semibold">SpendGuard v2.4</span>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
