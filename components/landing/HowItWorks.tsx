'use client';

import React from 'react';
import { Video, Cpu, Send, CheckCircle2, ArrowRight } from 'lucide-react';

export function HowItWorks() {
  const steps = [
    {
      step: "01",
      icon: Video,
      title: "Connect Your Meeting Tool",
      description: "Seamlessly integrates with Zoom, Google Meet, Microsoft Teams, or VoIP dialers in one click without intrusive meeting bots."
    },
    {
      step: "02",
      icon: Cpu,
      title: "Real-Time AI Processing",
      description: "Aura's neural engine analyzes live speaker turns, captures key facts, and maps agreements with sub-180ms latency."
    },
    {
      step: "03",
      icon: Send,
      title: "Instant Deliverables",
      description: "Structured action items, executive summaries, and Jira tasks are auto-drafted and pushed to your team's tools immediately."
    }
  ];

  return (
    <section id="how-it-works" className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      <div className="bg-[#FFF8F5] rounded-[36px] sm:rounded-[42px] border border-[#FFD9C7] p-8 sm:p-12 lg:p-16 relative overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#FF6B35]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-[#FF8A4C]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3 relative z-10">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white border border-[#FFD9C7] text-xs font-bold text-[#FF6B35]">
            <span>3-Step Simplicity</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#111111]">
            How Aura AI transforms your <span className="text-orange-gradient">daily workflow</span>
          </h2>
          <p className="text-base text-[#666666]">
            No complex setup, no manual note taking, no missed follow-ups.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={i}
                className="bg-white rounded-3xl p-7 border border-[#F0ECE7] saas-container-shadow hover:border-[#FFC7B0] transition-all duration-300 relative group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-[#FFF1EA] group-hover:bg-[#FF6B35] flex items-center justify-center text-[#FF6B35] group-hover:text-white transition-all duration-200">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-2xl font-black text-[#FFD9C7] font-mono">
                      {s.step}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-[#111111] mb-2">
                    {s.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#666666] leading-relaxed">
                    {s.description}
                  </p>
                </div>

                <div className="pt-4 mt-6 border-t border-[#F5F2EE] flex items-center space-x-1.5 text-xs text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Fully Automated</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
