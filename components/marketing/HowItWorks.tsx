'use client';

import React from 'react';
import { Key, ArrowRight, ShieldCheck, BarChart3, CheckCircle2, Terminal } from 'lucide-react';

const STEPS = [
  {
    step: '01',
    title: 'Connect Keys & Set Budgets',
    description: 'Add your OpenAI, Gemini, and Claude API keys securely to our encrypted vault. Set monthly spending caps for each engineering squad and project.',
    icon: Key,
    snippet: 'spendguard project create --name "payments" --budget 3000',
  },
  {
    step: '02',
    title: 'Drop In 1-Line Base URL',
    description: 'Change the baseURL in your existing OpenAI or Anthropic SDK to our gateway endpoint. No code refactoring or schema migrations required.',
    icon: Terminal,
    snippet: 'const client = new OpenAI({ baseURL: "https://gateway.spendguard.ai/v1" });',
  },
  {
    step: '03',
    title: 'Automate Spend Governance',
    description: 'Every call is audited, token costs calculated in real time, and overage requests fail closed before generating unauthorized provider bills.',
    icon: ShieldCheck,
    snippet: '✓ 142 req/s monitored · Soft warning at $2.4k · Hard block at $3.0k',
  },
];

export function HowItWorks() {
  return (
    <section id="use-cases" className="w-full py-20 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      {/* Container with soft background */}
      <div className="bg-[#FFF8F5] rounded-[36px] sm:rounded-[42px] border border-[#FFE2D6] p-8 sm:p-12 lg:p-16">
        
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF1EA] border border-[#FFD9C7] text-xs font-semibold text-[#FF6B35] mb-3">
            <span>Simple 5-Minute Setup</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#111111]">
            How SpendGuard Integrates Seamlessly
          </h2>
          <p className="mt-3 text-base text-[#666666]">
            No complex infrastructure rewrites. Just swap your API endpoint and gain instant enterprise-grade cost governance.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            return (
              <div
                key={idx}
                className="bg-white rounded-3xl p-7 sm:p-8 border border-[#F0ECE7] shadow-[0_8px_24px_rgba(0,0,0,0.04)] flex flex-col justify-between hover:border-[#FF6B35] transition-all duration-300"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-3xl font-black text-[#FF6B35]/30 font-mono">
                      {s.step}
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-[#FFF1EA] text-[#FF6B35] flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-[#111111] mb-2.5">
                    {s.title}
                  </h3>

                  <p className="text-sm text-[#666666] leading-relaxed mb-6">
                    {s.description}
                  </p>
                </div>

                <div className="p-3 bg-[#111111] rounded-xl text-[11px] font-mono text-[#FFA06E] overflow-x-auto">
                  <code>{s.snippet}</code>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
