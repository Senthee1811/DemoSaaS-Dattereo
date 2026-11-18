'use client';

import React from 'react';
import { ShieldCheck, Cpu } from 'lucide-react';

interface CaseStudy {
  quote: string;
  author: string;
  role: string;
  company: string;
  initials: string;
  metricLabel: string;
  metricValue: string;
  stack: string;
}

const CASE_STUDIES: CaseStudy[] = [
  {
    quote:
      "A runaway async worker looped on GPT-4o embeddings and would have drained $4,800 overnight. SpendGuard's atomic Redis Lua reservation halted execution at the exact $500 project cap with a 429 before the second minute elapsed.",
    author: "Elena Rostova",
    role: "VP of Engineering",
    company: "NovaLabs AI",
    initials: "ER",
    metricLabel: "Runaway Overages Prevented",
    metricValue: "$18,400 / Q2",
    stack: "OpenAI · Next.js · BullMQ",
  },
  {
    quote:
      "Managing raw upstream API keys across 26 developers was an operational security risk. SpendGuard gave each engineer scoped tokens with hard monthly allocations. FinOps reconciliation dropped from 3 days to 5 minutes.",
    author: "David Chen",
    role: "Head of Infrastructure & FinOps",
    company: "Orbitly Systems",
    initials: "DC",
    metricLabel: "Cost Attribution",
    metricValue: "100% per-team",
    stack: "Anthropic · Claude 3.5 · Python",
  },
  {
    quote:
      "Our compliance auditor required an immutable cryptographic ledger of every LLM transaction. SpendGuard provides full token accounting and latency metrics with zero prompt retention and sub-5ms proxy overhead.",
    author: "Marcus Thorne",
    role: "Chief Technology Officer",
    company: "Flowmark Health",
    initials: "MT",
    metricLabel: "Gateway Overhead",
    metricValue: "< 4.8ms p95",
    stack: "Gemini 1.5 · LangChain · FastAPI",
  },
];

export function TestimonialsSection() {
  return (
    <section className="w-full py-20 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto border-t border-[#E5E0D8]">
      {/* Section Header — Editorial */}
      <div className="max-w-2xl mb-14">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF7F2] border border-[#FFD2C0] text-[11px] font-mono text-[#FF6B35] mb-3">
          <span>finops_engineering_reports.json</span>
        </div>
        <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#141413]">
          Engineered for production reliability &amp; cost containment
        </h2>
        <p className="mt-2 text-sm text-[#555550] leading-relaxed font-sans">
          How engineering teams eliminate surprise LLM overages and automate governance across OpenAI, Anthropic, and Google Gemini.
        </p>
      </div>

      {/* Case Study Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {CASE_STUDIES.map((study, idx) => (
          <div
            key={idx}
            className="bg-white rounded-2xl p-7 border border-[#E5E0D8] shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:border-[#CDC7BC] transition-colors"
          >
            <div>
              {/* Quantified Impact Metric */}
              <div className="pb-4 mb-4 border-b border-[#F0ECE6] flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#888882]">
                    {study.metricLabel}
                  </span>
                  <div className="text-2xl font-serif font-normal text-[#FF6B35] tabular-nums mt-0.5">
                    {study.metricValue}
                  </div>
                </div>
                <div className="w-9 h-9 rounded-xl bg-[#FAF8F5] border border-[#E5E0D8] flex items-center justify-center text-[#555550]">
                  <ShieldCheck className="w-4 h-4 text-[#FF6B35]" />
                </div>
              </div>

              {/* Quotation */}
              <p className="font-serif text-sm text-[#2A2B28] leading-relaxed mb-6 font-normal italic">
                &quot;{study.quote}&quot;
              </p>
            </div>

            {/* Author & Stack */}
            <div className="pt-4 border-t border-[#F0ECE6] space-y-3 font-sans">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#141413] text-white flex items-center justify-center font-mono font-bold text-xs">
                  {study.initials}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-[#141413]">{study.author}</span>
                  <span className="text-[11px] text-[#555550]">{study.role} · {study.company}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#777770] bg-[#FAF8F5] px-2.5 py-1 rounded-full border border-[#E5E0D8]">
                <Cpu className="w-3 h-3 text-[#FF6B35]" />
                <span>Stack: {study.stack}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
