'use client';

import React from 'react';
import { 
  Zap, 
  ShieldCheck, 
  Cpu, 
  Workflow, 
  Lock, 
  Sparkles, 
  CheckCircle2, 
  ArrowRight 
} from 'lucide-react';

export function FeaturesGrid() {
  const features = [
    {
      icon: Zap,
      title: "Sub-180ms Real-Time Inference",
      description: "Proprietary streaming transcription engine captures every word, hesitation, and tone change as it happens with zero perceptible delay.",
      badge: "Fastest in Class"
    },
    {
      icon: Sparkles,
      title: "Context-Aware Action Extraction",
      description: "Aura's neural parser identifies explicit agreements, assigned owners, deadlines, and dependencies—never miss a deliverable again.",
      badge: "99.6% Accuracy"
    },
    {
      icon: Workflow,
      title: "One-Click Workflow Automation",
      description: "Auto-sync meeting summaries, Jira tickets, Notion pages, and Slack announcements the moment your call ends without manual effort.",
      badge: "40+ Integrations"
    },
    {
      icon: ShieldCheck,
      title: "Zero-Retention Enterprise Privacy",
      description: "SOC2 Type II, HIPAA, and GDPR compliant. Your audio and transcripts are never used to train third-party public models.",
      badge: "Enterprise Grade"
    }
  ];

  return (
    <section id="use-cases" className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-[#FFF1EA] border border-[#FFD9C7] text-xs font-bold text-[#FF6B35]">
          <span>Built for Modern Teams</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#111111]">
          Engineered for depth, speed, and <span className="text-orange-gradient">absolute clarity</span>
        </h2>
        <p className="text-base text-[#666666]">
          Designed from the ground up for product managers, engineering teams, and executive leaders who value every minute.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
        {features.map((f, i) => {
          const Icon = f.icon;
          return (
            <div
              key={i}
              className="bg-white rounded-[28px] p-8 border border-[#F0ECE7] saas-container-shadow hover:border-[#FFC7B0] transition-all duration-300 group hover:-translate-y-1 relative flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-[#FFF1EA] group-hover:bg-[#FF6B35] flex items-center justify-center text-[#FF6B35] group-hover:text-white transition-all duration-200 shadow-sm">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#FFF8F5] text-[#FF6B35] border border-[#FFD9C7]">
                    {f.badge}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-[#111111] mb-2.5 group-hover:text-[#FF6B35] transition-colors">
                  {f.title}
                </h3>
                <p className="text-sm text-[#666666] leading-relaxed">
                  {f.description}
                </p>
              </div>

              <div className="pt-6 mt-6 border-t border-[#F5F2EE] flex items-center text-xs font-bold text-[#FF6B35] group-hover:translate-x-1 transition-transform">
                <span>Learn how it works</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
