'use client';

import React, { useState, useEffect } from 'react';
import { Activity, Zap, Layers, ArrowUpRight, ShieldAlert, Cpu } from 'lucide-react';

interface RequestLog {
  provider: string;
  model: string;
  tokens: number;
  cost: number;
  project: string;
  time: string;
}

const SAMPLE_REQUESTS: RequestLog[] = [
  {
    provider: 'openai',
    model: 'gpt-4o',
    tokens: 1204,
    cost: 0.018,
    project: 'Marketing Project',
    time: 'just now',
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet',
    tokens: 2840,
    cost: 0.042,
    project: 'Payments Copilot',
    time: '2s ago',
  },
  {
    provider: 'google',
    model: 'gemini-1.5-pro',
    tokens: 4120,
    cost: 0.015,
    project: 'Doc Analytics',
    time: '4s ago',
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    tokens: 890,
    cost: 0.003,
    project: 'Support Automation',
    time: '7s ago',
  },
];

export function GatewayMonitorCard() {
  const [activeReqIdx, setActiveReqIdx] = useState(0);
  const [throughputBars, setThroughputBars] = useState([
    28, 45, 60, 35, 75, 90, 65, 80, 55, 70, 95, 85, 60, 78, 92, 50, 68, 88, 72, 85, 98, 64, 82, 70,
  ]);
  const [isSimulating, setIsSimulating] = useState(false);

  // Dynamic animated throughput bars
  useEffect(() => {
    const interval = setInterval(() => {
      setThroughputBars((prev) =>
        prev.map(() => Math.floor(Math.random() * 65 + 30))
      );
    }, 450);
    return () => clearInterval(interval);
  }, []);

  const handleSimulateRequest = () => {
    setIsSimulating(true);
    setActiveReqIdx((prev) => (prev + 1) % SAMPLE_REQUESTS.length);
    setTimeout(() => setIsSimulating(false), 300);
  };

  const currentReq = SAMPLE_REQUESTS[activeReqIdx];

  return (
    <div className="relative w-full max-w-[460px] bg-[#111111] text-white rounded-3xl p-5 sm:p-6 shadow-[0_24px_50px_-10px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.08),0_0_30px_-5px_rgba(255,107,53,0.15)] transition-all">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#222222] border border-white/10 flex items-center justify-center text-[#FF6B35]">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-white tracking-tight flex items-center gap-1.5">
              <span>Payments Team</span>
              <span className="text-white/40">·</span>
              <span className="text-white/70 font-normal">Project Gateway</span>
            </div>
            <div className="text-[11px] text-white/50">Live Gateway Monitor</div>
          </div>
        </div>

        {/* Live Badge */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1A2E1A] border border-[#2B592B] text-[11px] font-semibold text-[#4ADE80]">
          <span className="w-2 h-2 rounded-full bg-[#4ADE80] animate-pulse" />
          <span>LIVE</span>
        </div>
      </div>

      {/* Real-time Request Throughput Visualizer (Replacing Audio Waveform) */}
      <div className="my-4 p-3.5 rounded-2xl bg-white/[0.04] border border-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium tracking-wide text-white/60 uppercase">
            Live Request Throughput
          </span>
          <span className="text-[11px] font-mono text-[#FF8A4C]">
            142 req/s · 98ms avg
          </span>
        </div>

        {/* Dynamic Vertical Throughput Bars */}
        <div className="h-12 flex items-end justify-between gap-1 px-1">
          {throughputBars.map((height, i) => (
            <div
              key={i}
              style={{ height: `${height}%` }}
              className="flex-1 rounded-full bg-gradient-to-t from-[#FF6B35]/60 to-[#FF8A4C] transition-all duration-300"
            />
          ))}
        </div>
      </div>

      {/* Status Line */}
      <div className="flex items-center gap-2 mb-3 px-1 text-[12px] text-white/80">
        <div className="w-2 h-2 rounded-full bg-[#FF6B35] animate-ping" />
        <span className="font-medium text-[#FF8A4C]">AI Analyzing Usage Pattern...</span>
      </div>

      {/* Request Log Line */}
      <div className={`p-3 rounded-xl bg-white/[0.06] border border-white/10 font-mono text-[11.5px] transition-transform duration-200 ${isSimulating ? 'scale-[0.98]' : 'scale-100'}`}>
        <div className="flex items-center justify-between text-white/90">
          <span className="text-[#FFA06E] font-semibold">{currentReq.provider}/{currentReq.model}</span>
          <span className="text-white/50">{currentReq.time}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-white/60 text-[11px]">
          <span>{currentReq.tokens.toLocaleString()} tokens</span>
          <span className="text-emerald-400 font-semibold">${currentReq.cost.toFixed(3)}</span>
          <span className="text-white/40">·</span>
          <span className="truncate max-w-[130px]">{currentReq.project}</span>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] text-white/70 font-medium">
          <Layers className="w-3.5 h-3.5 text-[#FF6B35]" />
          <span>4 Active Projects</span>
        </div>

        <button
          type="button"
          onClick={handleSimulateRequest}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF6B35] hover:bg-[#FF8A4C] text-white text-[11.5px] font-semibold shadow-md shadow-[#FF6B35]/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <span>Simulate Next Request</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
