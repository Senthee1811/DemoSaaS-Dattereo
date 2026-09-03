'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Check, ArrowRight, Sparkles, Shield, Zap } from 'lucide-react';

const PLANS = [
  {
    name: 'Starter',
    badge: 'Seed & Early Teams',
    description: 'Perfect for small teams needing visibility and baseline budget guardrails across OpenAI & Claude.',
    monthlyPrice: 49,
    annualPrice: 39,
    features: [
      'Up to $10,000 monthly AI spend managed',
      '3 Projects & 5 Team Members',
      'Unified Gateway for OpenAI & Gemini & Claude',
      'Soft-warning budget threshold alerts',
      '30-day immutable audit log history',
      'Email & Slack notification webhooks',
    ],
    ctaText: 'Start 14-Day Free Trial',
    popular: false,
  },
  {
    name: 'Growth & Scale',
    badge: 'Most Popular for High-Growth',
    description: 'For engineering teams and AI-native companies requiring hard-block enforcement and anomaly detection.',
    monthlyPrice: 199,
    annualPrice: 159,
    features: [
      'Up to $100,000 monthly AI spend managed',
      'Unlimited Projects & 25 Team Members',
      'Fail-closed automated hard budget blocking',
      'Statistical token spike anomaly detection',
      'Encrypted per-project API key vault & rotation',
      '1-year exportable compliance audit ledger',
      'Priority routing & dedicated Slack support',
    ],
    ctaText: 'Start Free 14-Day Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    badge: 'FinOps & Compliance',
    description: 'For large organizations needing custom spend limits, SOC2 compliance, SSO, and self-hosted gateway options.',
    monthlyPrice: 699,
    annualPrice: 559,
    features: [
      'Unlimited monthly AI spend managed',
      'Unlimited Projects & Organization RBAC',
      'Custom fail-closed policy engine',
      'SAML 2.0 / Okta SSO & SCIM directory sync',
      'Self-hosted VPC proxy deployment option',
      'Custom ERP & FinOps billing integrations',
      'Dedicated Customer Success Architect & SLA',
    ],
    ctaText: 'Contact Enterprise Sales',
    popular: false,
  },
];

export function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(true);

  return (
    <section id="pricing" className="w-full py-20 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-12">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF1EA] border border-[#FFD9C7] text-xs font-semibold text-[#FF6B35] mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Simple, Predictable Governance Pricing</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-[#111111]">
          Control spend without surprise bills
        </h2>
        <p className="mt-4 text-base sm:text-lg text-[#666666]">
          Every plan includes a 14-day full feature trial. No credit card required to get started.
        </p>

        {/* Billing Toggle */}
        <div className="mt-8 inline-flex items-center gap-3 p-1.5 bg-[#F4F1ED] rounded-full border border-[#E8E8E8]">
          <button
            type="button"
            onClick={() => setIsAnnual(false)}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
              !isAnnual
                ? 'bg-white text-[#111111] shadow-sm'
                : 'text-[#666666] hover:text-[#111111]'
            }`}
          >
            Monthly Billing
          </button>
          <button
            type="button"
            onClick={() => setIsAnnual(true)}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-1.5 ${
              isAnnual
                ? 'bg-white text-[#111111] shadow-sm'
                : 'text-[#666666] hover:text-[#111111]'
            }`}
          >
            <span>Annual Billing</span>
            <span className="text-[11px] font-bold text-[#FF6B35] bg-[#FFF1EA] px-2 py-0.5 rounded-full">
              Save 20%
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
        {PLANS.map((plan, idx) => {
          const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
          return (
            <div
              key={idx}
              className={`relative rounded-3xl p-8 sm:p-9 flex flex-col justify-between transition-all duration-300 ${
                plan.popular
                  ? 'bg-[#111111] text-white shadow-[0_24px_50px_rgba(255,107,53,0.15)] ring-2 ring-[#FF6B35]'
                  : 'bg-white text-[#111111] border border-[#E8E8E8] shadow-[0_4px_24px_rgba(0,0,0,0.04)] hover:border-[#FFD4C2]'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] text-white text-xs font-extrabold uppercase tracking-wider shadow-md">
                  {plan.badge}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`text-2xl font-black ${plan.popular ? 'text-white' : 'text-[#111111]'}`}>
                    {plan.name}
                  </h3>
                  {!plan.popular && (
                    <span className="text-xs font-semibold text-[#FF6B35] bg-[#FFF1EA] px-2.5 py-1 rounded-full">
                      {plan.badge}
                    </span>
                  )}
                </div>

                <p className={`text-xs sm:text-sm mt-2 mb-6 ${plan.popular ? 'text-white/70' : 'text-[#666666]'}`}>
                  {plan.description}
                </p>

                {/* Price */}
                <div className="flex items-baseline gap-1 mb-8">
                  <span className="text-4xl sm:text-5xl font-extrabold tracking-tight">
                    ${price}
                  </span>
                  <span className={`text-sm ${plan.popular ? 'text-white/60' : 'text-[#777777]'}`}>
                    / month {isAnnual && 'billed annually'}
                  </span>
                </div>

                {/* Feature List */}
                <div className="space-y-3.5 mb-8">
                  <div className={`text-xs font-bold uppercase tracking-wider ${plan.popular ? 'text-white/50' : 'text-[#888888]'}`}>
                    What's included:
                  </div>
                  {plan.features.map((feat, fIdx) => (
                    <div key={fIdx} className="flex items-start gap-3 text-xs sm:text-sm">
                      <div className={`w-4 h-4 rounded-full mt-0.5 flex-shrink-0 flex items-center justify-center ${
                        plan.popular ? 'bg-[#FF6B35] text-white' : 'bg-[#FFF1EA] text-[#FF6B35]'
                      }`}>
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                      <span className={plan.popular ? 'text-white/90' : 'text-[#333333]'}>
                        {feat}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <Link
                href="/dashboard"
                className={`w-full py-3.5 px-6 rounded-2xl text-center font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                  plan.popular
                    ? 'bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] text-white shadow-[0_6px_20px_rgba(255,107,53,0.35)] hover:scale-[1.02]'
                    : 'bg-[#F6F6F6] text-[#111111] hover:bg-[#EAEAEA]'
                }`}
              >
                <span>{plan.ctaText}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
