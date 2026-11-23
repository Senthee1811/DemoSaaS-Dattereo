'use client';

import React from 'react';
import { Key, Terminal, ShieldCheck } from 'lucide-react';

const STEPS = [
  {
    step: '01',
    title: 'Connect Keys & Set Budgets',
    description: 'Add your OpenAI, Gemini, and Claude API keys to the envelope encryption vault. Assign monthly spending caps for each engineering squad.',
    icon: Key,
    snippet: 'spendguard project create --name "payments" --budget 3000',
  },
  {
    step: '02',
    title: 'Drop In 1-Line Base URL',
    description: 'Change the baseURL in your existing OpenAI or Anthropic SDK to the SpendGuard gateway endpoint. No code refactoring or schema migrations required.',
    icon: Terminal,
    snippet: 'const client = new OpenAI({ baseURL: "https://gateway.spendguard.ai/v1" });',
  },
  {
    step: '03',
    title: 'Enforce Atomic Governance',
    description: 'Every inference call executes an atomic Lua reservation, token costs are calculated in real time, and overage requests fail closed before bills happen.',
    icon: ShieldCheck,
    snippet: '✓ Sub-5ms check · Warning at 80% · Fail-closed at 100%',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="w-full py-16 px-4 sm:px-6 lg:px-8 max-w-310 mx-auto">
      <div className="bg-white rounded-2xl border border-parchment-border p-8 sm:p-12 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
        {/* Header — Editorial */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-label font-mono uppercase tracking-wider text-[#FF6B35] bg-[#FFF7F2] border border-[#FFD2C0] px-3 py-1 rounded-full">
            Integration Workflow
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-inversion-dark mt-3">
            3-Step Developer Integration
          </h2>
          <p className="mt-2 text-sm text-[#555550] font-sans">
            Zero infrastructure rewrites. Swap your API base URL and gain immediate enterprise FinOps controls.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            return (
              <div
                key={idx}
                className="bg-parchment-ivory rounded-xl p-6 border border-parchment-border flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-2xl font-serif font-normal text-[#FF6B35]">
                      {s.step}
                    </span>
                    <div className="w-9 h-9 rounded-lg bg-white border border-parchment-border text-inversion-dark flex items-center justify-center">
                      <Icon className="w-4 h-4 text-[#FF6B35]" strokeWidth={2} />
                    </div>
                  </div>

                  <h3 className="font-serif text-base font-normal text-inversion-dark mb-2">
                    {s.title}
                  </h3>

                  <p className="text-xs text-[#555550] leading-relaxed mb-4 font-sans">
                    {s.description}
                  </p>
                </div>

                <div className="p-3 bg-inversion-dark rounded-lg border border-[#2A2A28] text-label font-mono text-[#D6D6D0] overflow-x-auto">
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
