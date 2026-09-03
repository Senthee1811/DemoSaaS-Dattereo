'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, Zap, Sparkles, CheckCircle2 } from 'lucide-react';

export function CtaBanner() {
  return (
    <section className="w-full py-16 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      <div className="relative rounded-[36px] sm:rounded-[42px] bg-gradient-to-br from-[#111111] via-[#1A1A1A] to-[#111111] text-white p-8 sm:p-14 lg:p-20 overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.08)]">
        
        {/* Glow Effects */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#FF6B35]/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-[#FF8A4C]/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto text-center space-y-7">
          
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-[#FFA06E]">
            <Sparkles className="w-3.5 h-3.5 text-[#FF6B35]" />
            <span>Start Eliminating AI Overspend Today</span>
          </div>

          {/* Heading */}
          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
            Take full control of your AI costs across every team
          </h2>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-white/70 max-w-xl mx-auto leading-relaxed">
            Join thousands of engineering and FinOps teams using SpendGuard to set hard budget limits, route multi-provider models, and maintain immutable audit trails.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-base font-bold text-white bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] shadow-[0_8px_25px_rgba(255,107,53,0.4)] hover:shadow-[0_12px_32px_rgba(255,107,53,0.5)] hover:scale-105 active:scale-95 transition-all"
            >
              <span>Get Started Free</span>
              <ArrowRight className="w-5 h-5" />
            </Link>

            <a
              href="#how-it-works"
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 rounded-full text-base font-semibold text-white/90 bg-white/5 border border-white/15 hover:bg-white/10 transition-all"
            >
              <span>Explore Interactive Demo</span>
            </a>
          </div>

          {/* Guarantee Badges */}
          <div className="pt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-white/60">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#FF6B35]" />
              14-day free trial
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#FF6B35]" />
              No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#FF6B35]" />
              5-minute drop-in setup
            </span>
          </div>

        </div>
      </div>
    </section>
  );
}
