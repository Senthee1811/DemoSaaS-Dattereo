'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Check, ArrowRight, Sparkles, Shield, Zap, X, Mail, Building, Send, CheckCircle2 } from 'lucide-react';

interface PlanFeature {
  text: string;
  badge?: string;
}

const PLANS: Array<{
  name: string;
  badge: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  features: PlanFeature[];
  ctaText: string;
  popular: boolean;
  isEnterpriseModal?: boolean;
}> = [
  {
    name: 'Starter',
    badge: 'Seed & Early Teams',
    description: 'Perfect for small teams needing visibility and baseline budget guardrails across OpenAI & Claude.',
    monthlyPrice: 49,
    annualPrice: 39,
    features: [
      { text: 'Up to $10,000 monthly AI spend managed' },
      { text: '3 Projects & 5 Team Members' },
      { text: 'Unified Gateway for OpenAI, Gemini & Claude' },
      { text: 'Soft-warning budget threshold alerts' },
      { text: '30-day immutable audit log history' },
      { text: 'Email & Slack notification webhooks' },
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
      { text: 'Up to $100,000 monthly AI spend managed' },
      { text: 'Unlimited Projects & 25 Team Members' },
      { text: 'Fail-closed automated hard budget blocking' },
      { text: 'Statistical token spike anomaly detection' },
      { text: 'Encrypted per-project API key vault & rotation' },
      { text: '1-year exportable compliance audit ledger' },
      { text: 'Priority routing & dedicated Slack support' },
    ],
    ctaText: 'Start Free 14-Day Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    badge: 'FinOps & Compliance',
    description: 'For large organizations needing custom spend limits, SOC2 compliance, custom SLA, and dedicated onboarding.',
    monthlyPrice: 0,
    annualPrice: 0,
    features: [
      { text: 'Unlimited monthly AI spend managed' },
      { text: 'Unlimited Projects & Organization RBAC' },
      { text: 'Custom fail-closed policy engine & SLA' },
      { text: 'SAML 2.0 / Okta SSO & SCIM sync', badge: 'Phase 4 Roadmap' },
      { text: 'Self-hosted VPC proxy deployment', badge: 'Roadmap' },
      { text: 'Custom ERP & FinOps billing integrations' },
      { text: 'Dedicated Customer Success Architect' },
    ],
    ctaText: 'Contact Enterprise Sales',
    popular: false,
    isEnterpriseModal: true,
  },
];

export function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(true);
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [salesName, setSalesName] = useState('');
  const [salesEmail, setSalesEmail] = useState('');
  const [salesCompany, setSalesCompany] = useState('');
  const [salesSpend, setSalesSpend] = useState('$50,000+/mo');
  const [salesMessage, setSalesMessage] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSalesSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!salesName || !salesEmail) return;
    setIsSubmitted(true);
    setTimeout(() => {
      // Auto close after 3s if desired
    }, 3000);
  };

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
                  {plan.isEnterpriseModal ? (
                    <span className="text-4xl sm:text-5xl font-extrabold tracking-tight">
                      Custom
                    </span>
                  ) : (
                    <>
                      <span className="text-4xl sm:text-5xl font-extrabold tracking-tight">
                        ${price}
                      </span>
                      <span className={`text-sm ${plan.popular ? 'text-white/60' : 'text-[#777777]'}`}>
                        / month {isAnnual && 'billed annually'}
                      </span>
                    </>
                  )}
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={plan.popular ? 'text-white/90' : 'text-[#333333]'}>
                          {feat.text}
                        </span>
                        {feat.badge && (
                          <span className={`text-[10px] px-2 py-0.2 rounded-full font-bold uppercase tracking-wider ${
                            feat.badge.includes('Roadmap')
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          }`}>
                            {feat.badge}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              {plan.isEnterpriseModal ? (
                <button
                  type="button"
                  onClick={() => setShowSalesModal(true)}
                  className="w-full py-3.5 px-6 rounded-2xl text-center font-bold text-sm transition-all flex items-center justify-center gap-2 bg-[#F6F6F6] text-[#111111] hover:bg-[#EAEAEA]"
                >
                  <span>{plan.ctaText}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
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
              )}
            </div>
          );
        })}
      </div>

      {/* Contact Enterprise Sales Modal */}
      {showSalesModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-[#E8E8E8] shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E8E8]">
              <div>
                <h3 className="text-xl font-extrabold text-[#111111]">
                  Contact Enterprise Sales
                </h3>
                <p className="text-xs text-[#777777] mt-0.5">
                  Tailored governance architecture, custom SLA, and dedicated onboarding.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSalesModal(false);
                  setIsSubmitted(false);
                }}
                className="p-1.5 text-[#888888] hover:text-[#111111] rounded-xl hover:bg-[#F5F5F5]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isSubmitted ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-lg font-bold text-[#111111]">Thank You, {salesName}!</h4>
                <p className="text-xs text-[#666666] max-w-sm mx-auto">
                  Our FinOps solutions architect will reach out to <strong>{salesEmail}</strong> within 1 business day with a customized governance plan.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowSalesModal(false);
                    setIsSubmitted(false);
                  }}
                  className="mt-4 px-6 py-2.5 rounded-xl bg-[#111111] text-white text-xs font-bold"
                >
                  Close Window
                </button>
              </div>
            ) : (
              <form onSubmit={handleSalesSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Sarah Chen"
                      value={salesName}
                      onChange={(e) => setSalesName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                      Work Email *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="sarah@company.com"
                      value={salesEmail}
                      onChange={(e) => setSalesEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                      Company Name
                    </label>
                    <input
                      type="text"
                      placeholder="Apex Corp"
                      value={salesCompany}
                      onChange={(e) => setSalesCompany(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                      Estimated Monthly AI Spend
                    </label>
                    <select
                      value={salesSpend}
                      onChange={(e) => setSalesSpend(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35] bg-white"
                    >
                      <option value="$10,000 - $50,000">$10,000 - $50,000 / mo</option>
                      <option value="$50,000 - $150,000">$50,000 - $150,000 / mo</option>
                      <option value="$150,000+">$150,000+ / mo</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                    Requirements & Use Cases
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Tell us about your multi-model governance, fail-closed policy, or compliance needs..."
                    value={salesMessage}
                    onChange={(e) => setSalesMessage(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35]"
                  />
                </div>

                <div className="pt-3 border-t border-[#E8E8E8] flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSalesModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#666666] hover:bg-[#F5F5F5]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] shadow-md shadow-[#FF6B35]/25 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    Submit Enterprise Request
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
