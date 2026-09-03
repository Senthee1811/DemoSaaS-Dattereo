'use client';

import React, { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';

export function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const faqs = [
    {
      q: "How does Aura AI join meetings without an intrusive bot?",
      a: "Aura AI utilizes native desktop audio capture and direct integration with Zoom, Google Meet, Microsoft Teams, and dialer APIs. This allows Aura to listen locally with zero visible bot avatars crowding your meeting screen."
    },
    {
      q: "Is our conversation audio and transcript data private and secure?",
      a: "Yes, 100%. We operate on strict zero-retention policies. Your conversations are encrypted in transit and at rest using AES-256-GCM. We never use your proprietary data to train public models, and we are SOC2 Type II, HIPAA, and GDPR compliant."
    },
    {
      q: "How fast are real-time summaries and translations generated?",
      a: "Our streaming neural engine delivers speech-to-text inference in under 180ms. Action items and executive summaries are available live during the call and finalize within 3 seconds of hanging up."
    },
    {
      q: "Can Aura AI auto-sync tasks to Jira, Linear, Slack, and Notion?",
      a: "Yes. With our 1-click workspace integrations, Aura AI automatically converts agreed action items into formatted Jira/Linear tickets and posts formatted recaps directly to your designated Slack channels."
    },
    {
      q: "Can I try Aura AI before committing to a paid plan?",
      a: "Absolutely! We offer a full-featured 14-day free trial on all plans. No credit card is required to get started."
    }
  ];

  return (
    <section id="faq" className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-[900px] mx-auto">
      <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-[#FFF1EA] border border-[#FFD9C7] text-xs font-bold text-[#FF6B35]">
          <span>Got Questions?</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#111111]">
          Frequently asked <span className="text-orange-gradient">questions</span>
        </h2>
        <p className="text-base text-[#666666]">
          Everything you need to know about Aura AI's real-time intelligence engine.
        </p>
      </div>

      <div className="space-y-4">
        {faqs.map((faq, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div
              key={idx}
              className="bg-white rounded-2xl border border-[#F0ECE7] saas-container-shadow transition-all duration-200 overflow-hidden"
            >
              <button
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                className="w-full p-6 text-left flex items-center justify-between gap-4 cursor-pointer"
              >
                <span className="font-bold text-[#111111] text-base">{faq.q}</span>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform duration-200 ${
                  isOpen ? 'bg-[#FFF1EA] text-[#FF6B35] rotate-180' : 'bg-[#FAF8F5] text-[#777777]'
                }`}>
                  <ChevronDown className="w-4 h-4" />
                </div>
              </button>

              {isOpen && (
                <div className="px-6 pb-6 text-sm text-[#555555] leading-relaxed border-t border-[#FAF8F5] pt-3">
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
