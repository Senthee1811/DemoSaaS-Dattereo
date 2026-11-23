'use client';

import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

interface FaqItem {
  q: string;
  a: string;
  tag: string;
}

const FAQS: FaqItem[] = [
  {
    q: 'How does SpendGuard enforce budget limits without adding proxy latency?',
    a: 'SpendGuard implements an atomic Redis Lua pre-flight script. When a request arrives, the proxy checks the project budget reservation in memory in under 5ms before dispatching to the upstream provider (OpenAI, Anthropic, or Gemini). If the project exceeds its limit, the proxy immediately terminates the request with HTTP 429 without making an upstream call.',
    tag: 'LATENCY & REDIS',
  },
  {
    q: 'What is the operational behavior of "fail-closed" mode?',
    a: 'In fail-closed mode, if the Redis budget counter is unreachable or if network ambiguity prevents absolute spend verification, SpendGuard rejects outbound calls by default (HTTP 503 Service Unavailable). This ensures that upstream provider API calls can never silently rack up unbudgeted costs during infrastructure degradation.',
    tag: 'FAIL-CLOSED ARCHITECTURE',
  },
  {
    q: 'Does SpendGuard persist prompt content or inference completions?',
    a: 'No. SpendGuard adheres to a strict zero-prompt-retention architecture. We calculate token usage and cost dynamically and record only telemetry metadata (actor ID, project ID, model, input tokens, output tokens, cost in USD, and timestamp). Your prompt payloads and model completions are streamed directly without being written to disk or audit logs.',
    tag: 'SECURITY & PRIVACY',
  },
  {
    q: 'Can we replace our existing OpenAI client without rewriting application code?',
    a: 'Yes. SpendGuard provides an OpenAI-compatible /v1/chat/completions endpoint. You simply update your base URL to https://api.spendguard.dev/v1 and pass your SpendGuard scoped token. Official OpenAI SDKs (Node.js, Python), LangChain, and LlamaIndex work immediately with zero code modifications.',
    tag: 'DROP-IN COMPATIBILITY',
  },
  {
    q: 'How are upstream provider credentials (OpenAI, Anthropic, Gemini) secured?',
    a: 'All upstream provider keys are stored in an encrypted vault using AES-256-GCM envelope encryption with unique per-organization initialization vectors. Raw provider keys are decrypted only in memory at the gateway proxy layer and are never returned in plaintext to web browsers or client applications.',
    tag: 'KEY ENCRYPTION',
  },
  {
    q: 'How does statistical spike anomaly detection work?',
    a: 'The anomaly engine computes rolling hourly and daily expenditure baselines using a 3-sigma (Z-score > 3.0) deviation threshold. If an unexpected batch job or runaway agent loop causes spend velocity to surge abnormally compared to historical project norms, an alert appears immediately in your in-app Alerts feed, and in Slack if you add a webhook (email alerts are coming soon).',
    tag: 'ANOMALY ENGINE',
  },
];

export function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const toggleFaq = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section id="faq" className="w-full py-20 px-4 sm:px-6 lg:px-8 max-w-[960px] mx-auto border-t border-parchment-border">
      {/* Section Header — Editorial */}
      <div className="max-w-2xl mb-14">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF7F2] border border-[#FFD2C0] text-[11px] font-mono text-[#FF6B35] mb-3">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>architecture_faq.md</span>
        </div>
        <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-inversion-dark">
          Technical architecture &amp; operational questions
        </h2>
        <p className="mt-2 text-sm text-[#555550] leading-relaxed font-sans">
          Detailed explanations of proxy latency, budget reservation mechanics, and security guarantees.
        </p>
      </div>

      {/* Accordion List */}
      <div className="space-y-3.5">
        {FAQS.map((faq, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div
              key={idx}
              className={`rounded-2xl border transition-all ${
                isOpen
                  ? 'bg-white border-inversion-dark shadow-[0_2px_8px_rgba(0,0,0,0.03)]'
                  : 'bg-white border-parchment-border hover:border-[#CDC7BC]'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleFaq(idx)}
                className="w-full p-5 text-left flex items-start justify-between gap-4 focus:outline-none"
              >
                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-medium text-[#888882] tracking-wider">
                    {faq.tag}
                  </span>
                  <h3 className="font-serif text-base font-normal text-inversion-dark">
                    {faq.q}
                  </h3>
                </div>
                <div
                  className={`w-7 h-7 rounded-full border border-parchment-border flex items-center justify-center shrink-0 transition-transform duration-200 mt-1 ${
                    isOpen ? 'bg-inversion-dark text-white rotate-180 border-inversion-dark' : 'bg-parchment-ivory text-[#555550]'
                  }`}
                >
                  <ChevronDown className="w-4 h-4" />
                </div>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 text-xs sm:text-sm text-[#555550] leading-relaxed border-t border-[#F0ECE6] pt-3 font-sans">
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
