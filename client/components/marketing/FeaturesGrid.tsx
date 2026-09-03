'use client';

import React from 'react';
import { 
  ShieldCheck, 
  Layers, 
  Key, 
  FileText, 
  Activity, 
  Users, 
  Bell, 
  ArrowUpRight,
  TrendingDown,
  Lock,
  Cpu,
  Eye
} from 'lucide-react';

const FEATURES = [
  {
    icon: ShieldCheck,
    badge: 'Hard Budget Guardrails',
    title: 'Fail-Closed Budget Protection',
    description: 'Set monthly or weekly spending limits per project. Trigger Slack/email warnings at 80% and automatically hard-block requests before overages happen.',
    highlight: 'Zero surprise bills at month-end',
  },
  {
    icon: Layers,
    badge: 'Unified Gateway',
    title: 'One Endpoint for All LLMs',
    description: 'Route traffic across OpenAI, Google Gemini, and Anthropic Claude via a single high-performance proxy with sub-100ms overhead.',
    highlight: 'Drop-in SDK & OpenAI API compatibility',
  },
  {
    icon: Key,
    badge: 'Encrypted Key Vault',
    title: 'Scoped Provider Key Rotation',
    description: 'Never distribute master provider API keys to developers. Store keys encrypted at rest with AES-256 and scope access per project and team.',
    highlight: 'Role-based key access governance',
  },
  {
    icon: FileText,
    badge: 'Compliance Audit',
    title: 'Immutable Request Ledger',
    description: 'Every inference request is immutably logged with user identity, project ID, token counts, model version, and exact dollar cost. Exportable to CSV.',
    highlight: 'SOC2 & internal compliance ready',
  },
  {
    icon: Activity,
    badge: 'Anomaly Detection',
    title: 'Statistical Spike Alerts',
    description: 'Detect abnormal token spikes, runaway loops, or unoptimized prompts before they drain thousands of dollars in minutes.',
    highlight: 'Continuous statistical pattern analysis',
  },
  {
    icon: Users,
    badge: 'Org Hierarchy',
    title: 'Multi-Team Cost Allocation',
    description: 'Create organizations, departments, and project workgroups. Give engineering leads and FinOps managers exact line-item spend attribution.',
    highlight: 'Granular chargeback & showback',
  },
];

export function FeaturesGrid() {
  return (
    <section id="features" className="w-full py-20 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF1EA] border border-[#FFD9C7] text-xs font-semibold text-[#FF6B35] mb-4">
          <Eye className="w-3.5 h-3.5" />
          <span>Governance Infrastructure</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-[#111111]">
          Everything you need to govern enterprise AI spend
        </h2>
        <p className="mt-4 text-base sm:text-lg text-[#666666]">
          Multi-provider flexibility shouldn't mean financial chaos. SpendGuard gives you complete visibility, real-time control, and cryptographic accountability.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {FEATURES.map((feat, idx) => {
          const Icon = feat.icon;
          return (
            <div
              key={idx}
              className="group bg-white rounded-3xl p-7 sm:p-8 border border-[#E8E8E8] shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_36px_rgba(255,107,53,0.1)] hover:border-[#FFD4C2] transition-all duration-300 flex flex-col justify-between"
            >
              <div>
                {/* Top Row: Icon + Badge */}
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-[#FFF1EA] text-[#FF6B35] flex items-center justify-center group-hover:scale-110 group-hover:bg-[#FF6B35] group-hover:text-white transition-all duration-300 shadow-sm">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-[11px] font-bold text-[#FF6B35] bg-[#FFF8F5] px-2.5 py-1 rounded-full border border-[#FFE2D6]">
                    {feat.badge}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-xl font-bold text-[#111111] mb-2.5 group-hover:text-[#FF6B35] transition-colors">
                  {feat.title}
                </h3>

                {/* Description */}
                <p className="text-sm text-[#666666] leading-relaxed">
                  {feat.description}
                </p>
              </div>

              {/* Bottom Highlight */}
              <div className="mt-6 pt-4 border-t border-[#F2EFEA] flex items-center justify-between text-xs">
                <span className="font-semibold text-[#333333] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B35]" />
                  {feat.highlight}
                </span>
                <ArrowUpRight className="w-4 h-4 text-[#999999] group-hover:text-[#FF6B35] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
