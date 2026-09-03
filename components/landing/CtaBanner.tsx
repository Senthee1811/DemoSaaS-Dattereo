'use client';

import React from 'react';
import { ArrowRight, Sparkles, Check } from 'lucide-react';

export function CtaBanner() {
  return (
    <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      <div className="bg-[#111111] rounded-[36px] sm:rounded-[42px] p-8 sm:p-14 lg:p-16 text-center relative overflow-hidden dark-card-shadow">
        {/* Ambient Orange Glow Behind Banner */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-[#FF6B35]/20 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-2xl mx-auto space-y-6 relative z-10">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-bold text-[#FFA06E]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Ready to upgrade your conversations?</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Stop taking manual notes. <br />
            <span className="text-orange-gradient">Start leading the meeting.</span>
          </h2>

          <p className="text-sm sm:text-base text-white/70 max-w-lg mx-auto leading-relaxed">
            Join over 2,400+ forward-thinking teams using Aura AI to capture critical insights and automate post-meeting deliverables.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="#signup"
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2.5 px-8 py-4 bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] hover:from-[#F55D25] hover:to-[#FF7B38] text-white text-base font-bold rounded-full shadow-lg shadow-[#FF6B35]/30 hover:shadow-xl hover:shadow-[#FF6B35]/40 hover:-translate-y-0.5 transition-all duration-200"
            >
              <span>Get started for free</span>
              <ArrowRight className="w-4 h-4" />
            </a>

            <a
              href="#demo"
              className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-4 bg-white/10 hover:bg-white/15 text-white text-base font-semibold rounded-full border border-white/20 transition-all duration-200"
            >
              Schedule a demo
            </a>
          </div>

          <div className="pt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/60">
            <div className="flex items-center space-x-1.5">
              <Check className="w-3.5 h-3.5 text-[#FF8A4C]" />
              <span>Free 14-day trial</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <Check className="w-3.5 h-3.5 text-[#FF8A4C]" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <Check className="w-3.5 h-3.5 text-[#FF8A4C]" />
              <span>Setup in under 60 seconds</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
