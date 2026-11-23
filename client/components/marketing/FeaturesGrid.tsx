'use client';

import React from 'react';
import {
  ShieldCheck,
  Layers,
  Key,
  FileText,
  Activity,
  Users,
} from 'lucide-react';

const FEATURES = [
  {
    icon: ShieldCheck,
    badge: 'Atomic Pre-Flight Guardrails',
    title: 'Fail-Closed Budget Protection',
    description: 'Enforce monthly spending limits per project and per API key using atomic Redis Lua scripts. Triggers warnings at 80% and blocks requests before overages happen.',
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
    title: 'Encrypted Key Vault (AES-256-GCM)',
    description: 'Store master provider credentials encrypted at rest with two-tier envelope encryption. Issue virtual scoped keys without exposing upstream credentials.',
    highlight: 'Zero plaintext provider keys stored or leaked',
  },
  {
    icon: FileText,
    badge: 'Compliance Audit',
    title: 'Cryptographic Request Ledger',
    description: 'Every inference request is immutably recorded with project identity, model version, exact token counts, and verified dollar cost. Instant CSV export.',
    highlight: 'CSV export for internal audits',
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
    <section id="features" className="w-full py-20 px-4 sm:px-6 lg:px-8 max-w-310 mx-auto border-t border-parchment-border">
      {/* Section Header — Editorial */}
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="text-label font-mono uppercase tracking-wider text-[#FF6B35] bg-[#FFF7F2] border border-[#FFD2C0] px-3 py-1 rounded-full">
          Platform Architecture
        </span>
        <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-inversion-dark mt-3">
          Infrastructure Built for FinOps Rigor
        </h2>
        <p className="mt-2 text-sm text-[#555550] font-sans">
          Multi-provider flexibility with mathematical budget guarantees and complete cryptographic accountability.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {FEATURES.map((feat, idx) => {
          const Icon = feat.icon;
          return (
            <div
              key={idx}
              className="bg-white rounded-2xl p-6 border border-parchment-border shadow-[0_1px_4px_rgba(0,0,0,0.02)] flex flex-col justify-between transition-colors hover:border-[#CDC7BC]"
            >
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-parchment-ivory text-inversion-dark border border-parchment-border flex items-center justify-center">
                    <Icon className="w-4 h-4 text-[#FF6B35]" strokeWidth={2} />
                  </div>
                  <span className="text-caption font-mono text-[#666660] bg-parchment-ivory px-2.5 py-0.5 rounded-full border border-parchment-border">
                    {feat.badge}
                  </span>
                </div>

                <h3 className="font-serif text-base font-normal text-inversion-dark">{feat.title}</h3>

                <p className="text-xs text-[#555550] leading-relaxed font-sans">
                  {feat.description}
                </p>
              </div>

              <div className="mt-4 pt-3.5 border-t border-[#F0ECE6] text-label font-mono text-[#0D9488] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488]" />
                <span>{feat.highlight}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
