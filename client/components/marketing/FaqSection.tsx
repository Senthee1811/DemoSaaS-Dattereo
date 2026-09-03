'use client';

import React, { useState } from 'react';
import { ChevronDown, Sparkles, HelpCircle } from 'lucide-react';

const FAQS = [
  {
    q: 'How much latency does the SpendGuard proxy add to LLM calls?',
    a: 'SpendGuard is built on a high-throughput edge proxy architecture. Typical latency overhead is only 50–100ms in addition to provider response times. Pre-flight budget verification takes under 5ms via in-memory Redis caching.',
  },
  {
    q: 'What does "fail-closed" budget blocking mean?',
    a: 'Unlike tools that only send passive alerts after a bill has already spiked, SpendGuard enforces hard budget caps before proxying the request. If a project exceeds its allocated budget (or if network state is ambiguous), requests immediately return HTTP 429, guaranteeing zero unexpected overages.',
  },
  {
    q: 'Does SpendGuard store our prompt texts or sensitive completions?',
    a: 'No. SpendGuard has a strict zero-prompt-retention architecture. We calculate token usage and cost dynamically and record only telemetry metadata (user ID, project ID, model, token count, cost). Your proprietary prompts and inference data are streamed directly without persistent storage.',
  },
  {
    q: 'Which LLM providers and models are currently supported?',
    a: 'SpendGuard supports all major model families across OpenAI (GPT-4o, GPT-4o-mini, o1), Anthropic (Claude 3.5 Sonnet, Claude 3 Opus/Haiku), and Google (Gemini 1.5 Pro, Gemini 1.5 Flash) with seamless OpenAI-compatible SDK endpoint support.',
  },
  {
    q: 'How are provider API keys stored and secured?',
    a: 'Master provider keys are encrypted at rest using AES-256-GCM. Developers only receive scoped project tokens, meaning master provider keys are never exposed in local .env files, Git repositories, or CI/CD pipelines.',
  },
  {
    q: 'Can we export audit logs for SOC2 and internal financial audits?',
    a: 'Yes. Every inference request is recorded with immutable timestamps, actor IDs, project tags, and cost estimates. You can filter and export complete audit trails via CSV or programmatic API at any time.',
  },
];

export function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const toggleFaq = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section id="faq" className="w-full py-20 px-4 sm:px-6 lg:px-8 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF1EA] border border-[#FFD9C7] text-xs font-semibold text-[#FF6B35] mb-3">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Frequently Asked Questions</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#111111]">
          Everything you need to know
        </h2>
        <p className="mt-3 text-base text-[#666666]">
          Have questions about proxy latency, security, or multi-provider routing? We've got answers.
        </p>
      </div>

      {/* Accordion List */}
      <div className="space-y-4">
        {FAQS.map((faq, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div
              key={idx}
              className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                isOpen
                  ? 'bg-white border-[#FF6B35] shadow-[0_8px_24px_rgba(255,107,53,0.08)] ring-1 ring-[#FF6B35]'
                  : 'bg-white border-[#E8E8E8] hover:border-[#CCCCCC]'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleFaq(idx)}
                className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 focus:outline-none"
              >
                <span className="text-base sm:text-lg font-bold text-[#111111]">
                  {faq.q}
                </span>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-transform duration-200 ${
                  isOpen ? 'bg-[#FFF1EA] text-[#FF6B35] rotate-180' : 'bg-[#F4F4F4] text-[#666666]'
                }`}>
                  <ChevronDown className="w-4 h-4" />
                </div>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 sm:px-6 sm:pb-6 text-sm text-[#555555] leading-relaxed border-t border-[#F5F5F5] pt-3 animate-in fade-in-50 duration-200">
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
