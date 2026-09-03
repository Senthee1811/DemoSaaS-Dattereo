'use client';

import React, { useState } from 'react';
import { Check, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

export function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(true);

  const plans = [
    {
      name: "Starter",
      desc: "For individual leaders, founders, and consultants looking for automated meeting intelligence.",
      price: isAnnual ? 19 : 24,
      period: "per user / month",
      popular: false,
      cta: "Start 14-Day Free Trial",
      features: [
        "Up to 25 hours of live conversation analysis / mo",
        "Real-time action item & decision extraction",
        "Zoom, Google Meet & Microsoft Teams integration",
        "Export to Notion, Slack & Email",
        "7-day audio & transcript history",
        "Standard email support"
      ]
    },
    {
      name: "Pro Intelligence",
      desc: "For fast-moving product, engineering, and revenue teams requiring deep real-time sync.",
      price: isAnnual ? 49 : 59,
      period: "per user / month",
      popular: true,
      cta: "Get Started Free",
      features: [
        "Unlimited live conversation analysis",
        "Multi-speaker identification & sentiment analytics",
        "Automated 2-way sync with Jira, Linear & HubSpot",
        "Live translation across 40+ languages (<180ms)",
        "Custom vocabulary & acronym training",
        "Unlimited searchable conversation archive",
        "Priority 24/7 Slack & chat support"
      ]
    },
    {
      name: "Enterprise",
      desc: "For high-scale enterprises demanding custom LLM routing, strict SLAs, and bespoke security.",
      price: "Custom",
      period: "annual custom billing",
      popular: false,
      cta: "Contact Enterprise Sales",
      features: [
        "Dedicated private LLM instance & zero data retention",
        "Custom SAML SSO & SCIM directory sync",
        "SOC2 Type II, HIPAA & GDPR compliance certification",
        "Custom webhook automation & full REST API access",
        "Dedicated customer success manager & 99.99% SLA",
        "On-premise / VPC deployment options"
      ]
    }
  ];

  return (
    <section id="pricing" className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-[#FFF1EA] border border-[#FFD9C7] text-xs font-bold text-[#FF6B35]">
          <span>Transparent Pricing</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#111111]">
          Simple, predictable plans for <span className="text-orange-gradient">every team</span>
        </h2>
        <p className="text-base text-[#666666]">
          Start your 14-day free trial today. No credit card required. Cancel anytime.
        </p>

        {/* Monthly / Annual Toggle */}
        <div className="pt-4 flex items-center justify-center space-x-3">
          <span className={`text-xs sm:text-sm font-semibold ${!isAnnual ? 'text-[#111111]' : 'text-[#777777]'}`}>
            Monthly Billing
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className="w-14 h-8 bg-[#111111] rounded-full p-1 transition-colors relative cursor-pointer"
            aria-label="Toggle annual pricing"
          >
            <div
              className={`w-6 h-6 bg-[#FF6B35] rounded-full transition-transform duration-200 ${
                isAnnual ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
          <span className={`text-xs sm:text-sm font-semibold flex items-center space-x-1.5 ${isAnnual ? 'text-[#111111]' : 'text-[#777777]'}`}>
            <span>Annual Billing</span>
            <span className="px-2 py-0.5 rounded-full bg-[#FFF1EA] text-[#FF6B35] text-[11px] font-bold border border-[#FFD9C7]">
              Save 20%
            </span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
        {plans.map((p, i) => (
          <div
            key={i}
            className={`rounded-[32px] p-8 transition-all duration-300 relative flex flex-col justify-between ${
              p.popular
                ? 'bg-white border-2 border-[#FF6B35] saas-container-shadow lg:-translate-y-2'
                : 'bg-white border border-[#F0ECE7] saas-container-shadow hover:border-[#FFC7B0]'
            }`}
          >
            {p.popular && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] text-white text-xs font-bold tracking-wide uppercase shadow-md shadow-[#FF6B35]/20">
                Most Popular
              </div>
            )}

            <div>
              <div className="mb-6">
                <h3 className="text-xl font-bold text-[#111111]">{p.name}</h3>
                <p className="text-xs text-[#666666] mt-1.5 min-h-[36px]">{p.desc}</p>
              </div>

              <div className="flex items-baseline space-x-1 mb-6 pb-6 border-b border-[#F0ECE7]">
                {typeof p.price === 'number' ? (
                  <>
                    <span className="text-4xl font-extrabold text-[#111111]">${p.price}</span>
                    <span className="text-xs text-[#777777] font-medium">/{p.period}</span>
                  </>
                ) : (
                  <span className="text-4xl font-extrabold text-[#111111]">{p.price}</span>
                )}
              </div>

              {/* Feature List */}
              <div className="space-y-3 mb-8">
                <span className="text-xs font-bold text-[#111111] uppercase tracking-wider block">What's included:</span>
                {p.features.map((feat, idx) => (
                  <div key={idx} className="flex items-start space-x-2.5 text-xs text-[#444444]">
                    <Check className="w-4 h-4 text-[#FF6B35] shrink-0 mt-0.5 stroke-[2.5]" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <a
              href="#signup"
              className={`w-full py-3.5 rounded-full text-center text-sm font-bold transition-all duration-200 block ${
                p.popular
                  ? 'bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] hover:from-[#F55D25] hover:to-[#FF7B38] text-white shadow-md shadow-[#FF6B35]/25 hover:shadow-lg hover:shadow-[#FF6B35]/35 hover:-translate-y-0.5'
                  : 'bg-[#111111] hover:bg-[#222222] text-white'
              }`}
            >
              {p.cta}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
