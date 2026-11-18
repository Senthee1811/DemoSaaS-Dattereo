'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Play, 
  ShieldCheck, 
  ShieldAlert, 
  Layers, 
  Clock, 
  DollarSign, 
  ArrowRight, 
  Zap, 
  RefreshCw,
  Terminal
} from 'lucide-react';

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  inCost: number; // per 1M
  outCost: number; // per 1M
}

const MODELS: ModelOption[] = [
  { id: 'gpt-4o', name: 'OpenAI GPT-4o', provider: 'OpenAI', inCost: 2.50, outCost: 10.00 },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', inCost: 3.00, outCost: 15.00 },
  { id: 'gemini-1-5-pro', name: 'Gemini 1.5 Pro', provider: 'Google', inCost: 1.25, outCost: 5.00 },
  { id: 'gpt-4o-mini', name: 'OpenAI GPT-4o Mini', provider: 'OpenAI', inCost: 0.15, outCost: 0.60 },
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
          latencyMs: Math.floor(Math.random() * 20 + 35),
        });
      }
      setIsExecuting(false);
    }, 350);
  };

  return (
    <section id="demo" className="w-full py-16 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      {/* Section Header — Editorial */}
      <div className="text-center max-w-2xl mx-auto mb-12">
        <span className="text-[11px] font-mono uppercase tracking-wider text-[#FF6B35] bg-[#FFF7F2] border border-[#FFD2C0] px-3 py-1 rounded-full">
          Interactive Gateway Test Bench
        </span>
        <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#141413] mt-3">
          Test Gateway Routing &amp; Pre-Flight Budgets
        </h2>
        <p className="mt-2 text-sm text-[#555550] font-sans">
          Simulate multi-model execution, sub-5ms Redis capacity reservations, and fail-closed over-budget blocking in real time.
        </p>
      </div>

      {/* Sandbox Workspace Card */}
      <div className="bg-white rounded-2xl border border-[#E5E0D8] shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Controls Panel (5 cols) */}
          <div className="lg:col-span-5 p-6 bg-[#FAF8F5] border-b lg:border-b-0 lg:border-r border-[#E5E0D8] flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#555550] block mb-2">
                  1. Upstream Foundation Model
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {MODELS.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setSelectedModel(model)}
                      className={`p-2.5 rounded-xl text-left border text-xs transition-colors ${
                        selectedModel.id === model.id
                          ? 'bg-white border-[#FF6B35] ring-1 ring-[#FF6B35] font-semibold text-[#141413]'
                          : 'bg-white border-[#E5E0D8] text-[#555550] hover:bg-[#F3EFE9]'
                      }`}
                    >
                      <div className="truncate font-sans">{model.name}</div>
                      <div className="text-[10px] font-mono text-[#888882] mt-0.5">
                        ${model.inCost} / ${model.outCost} (1M)
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#555550] block mb-2">
                  2. Project Allocation &amp; Guardrail
                </label>
                <div className="space-y-2">
                  {PROJECTS.map((proj) => {
                    const percent = Math.min(100, Math.round((proj.currentSpend / proj.budget) * 100));
                    return (
                      <button
                        key={proj.id}
                        type="button"
                        onClick={() => setSelectedProject(proj)}
                        className={`w-full p-2.5 rounded-xl text-left border transition-colors ${
                          selectedProject.id === proj.id
                            ? 'bg-white border-[#FF6B35] ring-1 ring-[#FF6B35]'
                            : 'bg-white border-[#E5E0D8] hover:bg-[#F3EFE9]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#141413]">{proj.name}</span>
                          <span className={`text-[11px] font-mono tabular-nums ${percent >= 100 ? 'text-[#DC2626]' : percent >= 80 ? 'text-[#D97706]' : 'text-[#0D9488]'}`}>
                            ${proj.currentSpend} / ${proj.budget} ({percent}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-[#EFECE6] rounded-full mt-2 overflow-hidden">
                          <div
                            style={{ width: `${percent}%` }}
                            className={`h-full ${
                              percent >= 100 ? 'bg-[#DC2626]' : percent >= 80 ? 'bg-[#D97706]' : 'bg-[#0D9488]'
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
                  <span className="font-mono text-[11px] text-[#555550]">Simulated Prompt + Completion Tokens</span>
                  <span className="font-mono tabular-nums font-bold text-[#141413]">{tokenLength.toLocaleString()}</span>
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
              className="w-full py-3 px-5 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] text-white font-semibold text-xs shadow-2xs transition-colors flex items-center justify-center gap-2"
            >
              {isExecuting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Evaluating Redis Reservation...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Execute Gateway Request</span>
                </>
              )}
            </button>
          </div>

          {/* Real-time Response & Audit Stream (7 cols) */}
          <div className="lg:col-span-7 p-6 bg-[#141413] text-[#ECECE8] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/10 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#0D9488]" />
                  <span className="font-mono text-[11px] text-[#A1A1AA]">gateway.spendguard.ai:443</span>
                </div>

                <span className="font-mono tabular-nums text-[11px] text-[#A1A1AA]">
                  Overhead: {lastResult?.latencyMs || 42}ms
                </span>
              </div>

              {/* Status Header */}
              <div className="mt-4">
                {lastResult?.blocked ? (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FEF2F2]/10 border border-[#DC2626]/40 text-[#EF4444] text-xs font-mono font-semibold">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>HTTP 429 HARD-BLOCKED (BUDGET EXCEEDED)</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#F0FDF4]/10 border border-[#0D9488]/40 text-[#34D399] text-xs font-mono font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>HTTP 200 OK — ATOMIC CAPACITY RESERVED</span>
                  </div>
                )}
              </div>

              {/* Headers breakdown */}
              <div className="mt-4 space-y-2 font-mono text-xs">
                <div className="text-[10px] text-[#71717A] uppercase tracking-wider">SpendGuard Headers</div>
                <div className="p-3 bg-[#232428] rounded border border-white/5 space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-[#A1A1AA]">x-spendguard-model:</span>
                    <span className="text-white">{selectedModel.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#A1A1AA]">x-spendguard-project:</span>
                    <span className="text-white">{selectedProject.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#A1A1AA]">x-spendguard-cost:</span>
                    <span className="text-[#34D399] tabular-nums">${lastResult?.cost.toFixed(6) || '0.000000'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#A1A1AA]">x-spendguard-tokens:</span>
                    <span className="text-white tabular-nums">{lastResult?.tokensIn || 0} in / {lastResult?.tokensOut || 0} out</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#A1A1AA]">x-spendguard-blocked:</span>
                    <span className={lastResult?.blocked ? 'text-[#EF4444]' : 'text-[#34D399]'}>
                      {String(lastResult?.blocked)}
                    </span>
                  </div>
                </div>

                {lastResult?.blocked && (
                  <p className="text-xs text-[#EF4444] pt-1">
                    {lastResult.reason}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-white/10 flex items-center justify-between text-xs">
              <span className="text-[#71717A]">Ready to route production workloads?</span>
              <Link
                href="/register"
                className="text-[#FF6B35] hover:underline font-semibold inline-flex items-center gap-1"
              >
                <span>Deploy Gateway Keys</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
