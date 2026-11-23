'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Check, ArrowRight, ShieldCheck, X, CheckCircle2 } from 'lucide-react';

interface PlanFeature {
  text: string;
  badge?: string;
}

interface Plan {
  id: string;
  name: string;
  badge: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  features: PlanFeature[];
  ctaText: string;
  popular: boolean;
  isEnterpriseModal?: boolean;
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    badge: 'Early Engineering Teams',
    description: 'Essential governance for products deploying their first production AI features.',
    monthlyPrice: 39,
    annualPrice: 31,
    features: [
      { text: 'Up to 3 production projects' },
      { text: '50,000 requests / month included' },
      { text: 'Pre-flight Redis budget validation' },
      { text: 'Unified routing: OpenAI, Anthropic, Gemini' },
      { text: 'In-app budget alerts' },
      { text: 'Email & webhook alert delivery', badge: 'Roadmap' },
      { text: '7-day immutable audit ledger' },
    ],
    ctaText: 'Start 14-Day Free Trial',
    popular: false,
  },
  {
    id: 'growth',
    name: 'Growth',
    badge: 'Recommended for Scale',
    description: 'Comprehensive FinOps infrastructure for high-volume multi-agent production systems.',
    monthlyPrice: 199,
    annualPrice: 159,
    features: [
      { text: 'Unlimited production projects' },
      { text: '500,000 requests / month included' },
      { text: 'Sub-5ms atomic Lua budget reservations' },
      { text: 'Statistical anomaly & spike detection (FR-9)' },
      { text: 'Slack, Discord, PagerDuty & webhook delivery', badge: 'Roadmap' },
      { text: '30-day immutable audit ledger & CSV export' },
      { text: 'Priority Slack engineering support' },
    ],
    ctaText: 'Start Free Trial',
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    badge: 'Custom Governance',
    description: 'Dedicated customer VPC proxy gateway and a custom SLA.',
    monthlyPrice: 799,
    annualPrice: 639,
    features: [
      { text: 'Dedicated customer VPC proxy gateway' },
      { text: 'Multi-million requests with a custom SLA' },
      { text: 'SAML 2.0 SSO & SCIM Directory sync', badge: 'Roadmap' },
      { text: 'Custom cost allocation & billing centers' },
      { text: 'Dedicated FinOps Solutions Architect' },
      { text: 'Custom MSA' },
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
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSalesSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!salesName || !salesEmail) return;
    setIsSubmitted(true);
  };

  return (
    <section id="pricing" className="w-full py-20 px-4 sm:px-6 lg:px-8 max-w-310 mx-auto border-t border-parchment-border">
      {/* Header — Editorial */}
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="text-label font-mono uppercase tracking-wider text-[#FF6B35] bg-[#FFF7F2] border border-[#FFD2C0] px-3 py-1 rounded-full">
          Transparent Pricing &amp; Quotas
        </span>
        <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-inversion-dark mt-3">
          Predictable Governance Tiers
        </h2>
        <p className="mt-2 text-sm text-[#555550] font-sans">
          Deterministic billing with zero surprise invoice spikes. 14-day free trial on all self-serve tiers.
        </p>

        {/* Toggle */}
        <div className="flex items-center justify-center gap-3 mt-6">
          <span className={`text-xs font-medium ${!isAnnual ? 'text-inversion-dark' : 'text-[#888882]'}`}>
            Monthly
          </span>
          <button
            type="button"
            onClick={() => setIsAnnual(!isAnnual)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isAnnual ? 'bg-[#FF6B35]' : 'bg-parchment-border'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                isAnnual ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-medium ${isAnnual ? 'text-inversion-dark' : 'text-[#888882]'}`}>
              Annual
            </span>
            <span className="px-2 py-0.5 rounded-full text-caption font-mono font-semibold bg-[#F0FDF4] text-[#0D9488] border border-[#BBF7D0]">
              Save 20%
            </span>
          </div>
        </div>
      </div>

      {/* Plan Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
          return (
            <div
              key={plan.id}
              className={`flex flex-col justify-between p-7 rounded-field bg-white transition-all ${
                plan.popular
                  ? 'border-2 border-[#FF6B35] shadow-[0_4px_20px_rgba(255,107,53,0.08)] relative'
                  : 'border border-parchment-border shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-lg font-normal text-inversion-dark">{plan.name}</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-caption font-mono ${
                    plan.popular
                      ? 'bg-[#FF6B35] text-white font-semibold'
                      : 'bg-parchment-ivory text-[#666660] border border-parchment-border'
                  }`}>
                    {plan.badge}
                  </span>
                </div>

                <p className="text-xs text-[#555550] leading-relaxed min-h-[32px] font-sans">
                  {plan.description}
                </p>

                <div className="pt-2 flex items-baseline gap-1">
                  <span className="font-serif text-4xl font-normal text-inversion-dark tabular-nums">
                    ${price}
                  </span>
                  <span className="text-xs text-[#888882] font-mono">/ mo</span>
                  {isAnnual && (
                    <span className="text-caption text-[#888882] ml-1 font-mono">billed annually</span>
                  )}
                </div>

                <div className="pt-5 border-t border-[#F0ECE6] space-y-2.5">
                  <div className="text-caption font-mono uppercase tracking-wider text-[#888882]">
                    Capabilities Included
                  </div>
                  {plan.features.map((feat, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-inversion-dark">
                      <Check className="w-3.5 h-3.5 text-[#0D9488] shrink-0 mt-0.5" strokeWidth={2.5} />
                      <div className="flex items-center gap-1.5 font-sans">
                        <span>{feat.text}</span>
                        {feat.badge && (
                          <span className="text-micro px-1.5 py-0.2 rounded-full bg-parchment-ivory text-[#555550] border border-parchment-border font-mono">
                            {feat.badge}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-[#F0ECE6]">
                {plan.isEnterpriseModal ? (
                  <button
                    type="button"
                    onClick={() => setShowSalesModal(true)}
                    className="w-full py-3 px-5 rounded-full text-center font-semibold text-xs bg-inversion-dark hover:bg-[#2A2A28] text-white transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>{plan.ctaText}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <Link
                    href="/register"
                    className={`w-full py-3 px-5 rounded-full text-center font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 ${
                      plan.popular
                        ? 'bg-[#FF6B35] hover:bg-[#E55A25] text-white shadow-2xs'
                        : 'bg-parchment-ivory hover:bg-[#EFECE6] text-inversion-dark border border-parchment-border'
                    }`}
                  >
                    <span>{plan.ctaText}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Enterprise Qualification Modal */}
      {showSalesModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-parchment-ivory rounded-card max-w-lg w-full p-6 border border-parchment-border shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-parchment-border">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#FF6B35]" />
                <h3 className="font-serif text-lg font-normal text-inversion-dark">Enterprise Architecture Review</h3>
              </div>
              <button
                type="button"
                onClick={() => { setShowSalesModal(false); setIsSubmitted(false); }}
                className="p-1.5 text-[#888882] hover:text-inversion-dark rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isSubmitted ? (
              <div className="p-6 text-center space-y-3 bg-[#F0FDF4] rounded-field border border-[#BBF7D0]">
                <CheckCircle2 className="w-7 h-7 text-[#0D9488] mx-auto" />
                <h4 className="font-serif text-base font-normal text-[#0D9488]">Inquiry Received</h4>
                <p className="text-xs text-[#134E4A] leading-relaxed">
                  A FinOps Solutions Architect will reach out within 2 hours to schedule your custom VPC proxy sizing.
                </p>
                <button
                  type="button"
                  onClick={() => { setShowSalesModal(false); setIsSubmitted(false); }}
                  className="px-5 py-2 bg-[#0D9488] text-white font-semibold text-xs rounded-full shadow-2xs"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSalesSubmit} className="space-y-4 text-xs">
                <p className="text-[#5F6368] leading-relaxed">
                  Enterprise plans include custom VPC proxy deployments, SAML 2.0 SSO/SCIM directory sync, tailored SLA guarantees, and dedicated solutions architecture.
                </p>

                <div>
                  <label className="font-semibold text-inversion-dark block mb-1.5">Your Name *</label>
                  <input
                    type="text"
                    required
                    value={salesName}
                    onChange={(e) => setSalesName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-field border border-parchment-border text-xs text-inversion-dark bg-white focus:outline-none focus:border-[#FF6B35]"
                    placeholder="e.g. Alex Rivera"
                  />
                </div>

                <div>
                  <label className="font-semibold text-inversion-dark block mb-1.5">Work Email *</label>
                  <input
                    type="email"
                    required
                    value={salesEmail}
                    onChange={(e) => setSalesEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-field border border-parchment-border text-xs text-inversion-dark bg-white focus:outline-none focus:border-[#FF6B35]"
                    placeholder="alex@company.com"
                  />
                </div>

                <div>
                  <label className="font-semibold text-inversion-dark block mb-1.5">Company & Domain *</label>
                  <input
                    type="text"
                    required
                    value={salesCompany}
                    onChange={(e) => setSalesCompany(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-field border border-parchment-border text-xs text-inversion-dark bg-white focus:outline-none focus:border-[#FF6B35]"
                    placeholder="e.g. Acme Corp"
                  />
                </div>

                <div>
                  <label className="font-semibold text-inversion-dark block mb-1.5">Monthly AI Spend Estimate</label>
                  <select
                    value={salesSpend}
                    onChange={(e) => setSalesSpend(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-field border border-parchment-border text-xs text-inversion-dark bg-white focus:outline-none focus:border-[#FF6B35]"
                  >
                    <option>$10,000 – $50,000 / month</option>
                    <option>$50,000 – $250,000 / month</option>
                    <option>$250,000+ / month</option>
                  </select>
                </div>

                <div className="pt-3 border-t border-parchment-border flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowSalesModal(false)}
                    className="px-4 py-2 rounded-full font-semibold text-[#5F6368] hover:bg-[#EFECE6] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-full font-semibold text-white bg-[#FF6B35] hover:bg-[#E55A25] shadow-2xs transition-colors"
                  >
                    Submit Request
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
