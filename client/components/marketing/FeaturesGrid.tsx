'use client';

import React from 'react';
import { 
  ShieldCheck, 
  Layers, 
  Key, 
  FileText, 
  Activity, 
  Users, 
  Lock,
  Cpu
} from 'lucide-react';

const FEATURES = [
  {
    icon: ShieldCheck,
    badge: 'Atomic Pre-Flight Guardrails',
    title: 'Fail-Closed Budget Protection',
    description: 'Enforce monthly or weekly spending limits per project using atomic Redis Lua scripts. Triggers warnings at 80% and blocks requests before overages happen.',
    highlight: 'Deterministic overage prevention under concurrent load',
  },
  {
    icon: Layers,
    badge: 'Unified Gateway',
    title: 'One Endpoint for OpenAI, Claude & Gemini',
    description: 'Route traffic across OpenAI, Google Gemini, and Anthropic Claude via a single high-performance proxy with sub-5ms latency overhead.',
    highlight: '100% drop-in OpenAI SDK compatibility',
  },
  {
    icon: Key,
    badge: 'Envelope Key Vault',
    title: 'Hardware-Level Key Protection (AES-256-GCM)',
    description: 'Store master provider credentials encrypted at rest with two-tier envelope encryption. Issue virtual scoped keys without exposing upstream credentials.',
    highlight: 'Zero plaintext provider keys stored or leaked',
  },
  {
    icon: FileText,
    badge: 'Compliance Audit',
    title: 'Cryptographic Request Ledger',
    description: 'Every inference request is immutably recorded with project identity, model version, exact token counts, and verified dollar cost. Instant CSV export.',
    highlight: 'SOC2 Type II & internal audit ready',
  },
  {
    icon: Activity,
    badge: 'Statistical Anomaly (FR-9)',
    title: 'Z-Score Outlier Spike Detection',
    description: 'Detect abnormal token spikes, runaway agent loops, and malformed prompts using mathematical standard deviation algorithms before budget depletion.',
    highlight: 'Continuous moving-average baseline analysis',
  },
  {
    icon: Users,
    badge: 'FinOps Attribution',
    title: 'Multi-Tenant Workgroup Allocation',
    description: 'Scope budgets per team, project, or microservice. Give engineering managers and FinOps teams exact line-item spend accountability.',
    highlight: 'Granular chargeback & showback attribution',
  },
];

export function FeaturesGrid() {
  return (
    <section id="features" className="w-full py-16 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      {/* Section Header */}
      <div className="text-center max-w-2xl mx-auto mb-12">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#FF6B35] bg-[#FFF5F0] border border-[#FFD2C0] px-2 py-0.5 rounded">
          Core Capabilities
        </span>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#18191B] mt-2">
          Infrastructure Built for FinOps Rigor
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-[#5F6368]">
          Multi-provider flexibility with mathematical budget guarantees and complete cryptographic accountability.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {FEATURES.map((feat, idx) => {
          const Icon = feat.icon;
          return (
            <div
              key={idx}
              className="bg-white rounded-xl p-5 border border-[#E4E4E0] shadow-xs flex flex-col justify-between transition-colors hover:border-[#D2D2CC]"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-md bg-[#F3F3F0] text-[#18191B] border border-[#E4E4E0] flex items-center justify-center">
                    <Icon className="w-4 h-4" strokeWidth={1.8} />
                  </div>
                  <span className="text-[10px] font-semibold text-[#5F6368] bg-[#FBFBFA] px-2 py-0.5 rounded border border-[#E4E4E0]">
                    {feat.badge}
                  </span>
                </div>

                <h3 className="text-sm font-semibold text-[#18191B]">{feat.title}</h3>

                <p className="text-xs text-[#5F6368] leading-relaxed">
                  {feat.description}
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-[#ECECE8] text-[11px] font-medium text-[#0D9488]">
                ✓ {feat.highlight}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
