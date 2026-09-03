'use client';

import React from 'react';
import { Star, ShieldCheck, Quote } from 'lucide-react';

const REVIEWS = [
  {
    quote: "We had a runaway batch script on GPT-4 that cost us $4,200 overnight before we had SpendGuard. Now, our hard-block limits prevent any project from going a single dollar over budget. It paid for itself on day one.",
    author: "Elena Rostova",
    role: "VP of Engineering",
    company: "NovaLabs AI",
    avatarBg: "bg-emerald-100 text-emerald-700",
    initials: "ER",
    stats: "Saved $18k in Q2 overages",
  },
  {
    quote: "Managing API keys across 14 engineers and 5 projects was an audit nightmare. SpendGuard centralized our OpenAI, Gemini, and Claude routing into one transparent ledger. Our monthly FinOps reconciliation takes 5 minutes now.",
    author: "David Chen",
    role: "Head of Infrastructure & FinOps",
    company: "Orbitly Systems",
    avatarBg: "bg-orange-100 text-[#FF6B35]",
    initials: "DC",
    stats: "100% spend attribution across teams",
  },
  {
    quote: "Our compliance team needed an immutable log of which developer queried what model with which token budget. SpendGuard gave us SOC2-grade auditability without adding any measurable proxy latency.",
    author: "Marcus Thorne",
    role: "Chief Technology Officer",
    company: "Flowmark Health",
    avatarBg: "bg-blue-100 text-blue-700",
    initials: "MT",
    stats: "Sub-80ms gateway overhead",
  },
];

export function TestimonialsSection() {
  return (
    <section className="w-full py-20 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-14">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF1EA] border border-[#FFD9C7] text-xs font-semibold text-[#FF6B35] mb-3">
          <span>Customer Stories</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#111111]">
          Trusted by engineering leaders & FinOps teams
        </h2>
        <p className="mt-3 text-base text-[#666666]">
          See how teams are eliminating surprise LLM invoices and getting complete visibility over their multi-model infrastructure.
        </p>
      </div>

      {/* Testimonial Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {REVIEWS.map((rev, idx) => (
          <div
            key={idx}
            className="bg-white rounded-3xl p-7 sm:p-8 border border-[#E8E8E8] shadow-[0_8px_24px_rgba(0,0,0,0.03)] flex flex-col justify-between hover:shadow-[0_12px_32px_rgba(255,107,53,0.08)] hover:border-[#FFD4C2] transition-all duration-300"
          >
            <div>
              {/* Stars */}
              <div className="flex items-center gap-1 mb-4 text-amber-400">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>

              {/* Quote */}
              <p className="text-sm text-[#333333] leading-relaxed mb-6 font-normal">
                "{rev.quote}"
              </p>
            </div>

            <div className="pt-4 border-t border-[#F2EFEA]">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${rev.avatarBg}`}>
                  {rev.initials}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-bold text-[#111111]">{rev.author}</span>
                  <span className="text-xs text-[#777777]">{rev.role} · {rev.company}</span>
                </div>
              </div>

              <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#FF6B35] bg-[#FFF8F5] px-2.5 py-1 rounded-md border border-[#FFE2D6]">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{rev.stats}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
