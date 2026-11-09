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
      { text: 'Email & Webhook budget alerts' },
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
      { text: 'Slack, Discord, PagerDuty & Webhooks' },
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
    description: 'Dedicated customer VPC proxy gateway, custom SLA, and SOC2/HIPAA compliance.',
    monthlyPrice: 799,
    annualPrice: 639,
    features: [
      { text: 'Dedicated customer VPC proxy gateway' },
      { text: 'Multi-million requests with 99.99% SLA' },
      { text: 'SAML 2.0 SSO & SCIM Directory sync', badge: 'Roadmap' },
      { text: 'Zero-trust hardware security module key storage' },
      { text: 'Custom cost allocation & billing centers' },
      { text: 'Dedicated FinOps Solutions Architect' },
      { text: 'Custom MSA, BAA & SOC2 type II audit access' },
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
    <section id="pricing" className="w-full py-16 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-10">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#FF6B35] bg-[#FFF5F0] border border-[#FFD2C0] px-2 py-0.5 rounded">
          Transparent Pricing
        </span>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#18191B] mt-2">
          Predictable Governance Tiers
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-[#5F6368]">
          Transparent plans with zero surprise billings. 14-day free trial on all self-serve tiers.
        </p>

        {/* Toggle */}
        <div className="flex items-center justify-center gap-3 mt-6">
          <span className={`text-xs font-semibold ${!isAnnual ? 'text-[#18191B]' : 'text-[#5F6368]'}`}>
            Monthly
          </span>
          <button
            type="button"
            onClick={() => setIsAnnual(!isAnnual)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isAnnual ? 'bg-[#FF6B35]' : 'bg-[#E4E4E0]'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                isAnnual ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-semibold ${isAnnual ? 'text-[#18191B]' : 'text-[#5F6368]'}`}>
              Annual
            </span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#F0FDF4] text-[#0D9488] border border-[#BBF7D0]">
              Save 20%
            </span>
          </div>
        </div>
      </div>

      {/* Plan Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PLANS.map((plan) => {
          const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
          return (
            <div
              key={plan.id}
              className={`flex flex-col justify-between p-6 rounded-xl bg-white transition-all ${
                plan.popular
                  ? 'border-2 border-[#FF6B35] shadow-xs'
                  : 'border border-[#E4E4E0] shadow-xs'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-[#18191B]">{plan.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    plan.popular
                      ? 'bg-[#18191B] text-white'
                      : 'bg-[#F3F3F0] text-[#5F6368]'
                  }`}>
                    {plan.badge}
                  </span>
                </div>

                <p className="text-xs text-[#5F6368] leading-relaxed min-h-[32px]">
                  {plan.description}
                </p>

                <div className="pt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-[#18191B] font-mono tabular-nums">
                    ${price}
                  </span>
                  <span className="text-xs text-[#80868B]">/ month</span>
                  {isAnnual && (
                    <span className="text-[10px] text-[#80868B] ml-1">billed annually</span>
                  )}
                </div>

                <div className="pt-4 border-t border-[#E4E4E0] space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#80868B]">
                    Capabilities
                  </div>
                  {plan.features.map((feat, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-[#18191B]">
                      <Check className="w-3.5 h-3.5 text-[#0D9488] shrink-0 mt-0.5" strokeWidth={2.5} />
                      <div className="flex items-center gap-1.5">
                        <span>{feat.text}</span>
                        {feat.badge && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-[#F3F3F0] text-[#5F6368] border border-[#E4E4E0]">
                            {feat.badge}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-[#E4E4E0]">
                {plan.isEnterpriseModal ? (
                  <button
                    type="button"
                    onClick={() => setShowSalesModal(true)}
                    className="w-full py-2.5 px-4 rounded-md text-center font-semibold text-xs bg-[#18191B] hover:bg-[#333333] text-white transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>{plan.ctaText}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <Link
                    href="/register"
                    className={`w-full py-2.5 px-4 rounded-md text-center font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 ${
                      plan.popular
                        ? 'bg-[#FF6B35] hover:bg-[#E85520] text-white'
                        : 'bg-[#18191B] hover:bg-[#333333] text-white'
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
          <div className="bg-white rounded-xl max-w-lg w-full p-6 border border-[#E4E4E0] shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E4E4E0]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#FF6B35]" />
                <h3 className="text-sm font-bold text-[#18191B]">Enterprise Architecture Review</h3>
              </div>
              <button
                type="button"
                onClick={() => { setShowSalesModal(false); setIsSubmitted(false); }}
                className="p-1 text-[#80868B] hover:text-[#18191B] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isSubmitted ? (
              <div className="p-5 text-center space-y-2.5 bg-[#F0FDF4] rounded-lg border border-[#BBF7D0]">
                <CheckCircle2 className="w-6 h-6 text-[#0D9488] mx-auto" />
                <h4 className="text-xs font-bold text-[#0D9488]">Inquiry Received</h4>
                <p className="text-xs text-[#134E4A] leading-relaxed">
                  A FinOps Solutions Architect will reach out within 2 hours to schedule your custom VPC proxy sizing.
                </p>
                <button
                  type="button"
                  onClick={() => { setShowSalesModal(false); setIsSubmitted(false); }}
                  className="px-3 py-1.5 bg-[#0D9488] text-white font-semibold text-xs rounded shadow-xs"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSalesSubmit} className="space-y-3 text-xs">
                <p className="text-[#5F6368] leading-relaxed">
                  Enterprise plans include custom VPC proxy deployments, SAML 2.0 SSO/SCIM directory sync, tailored SLA guarantees, and dedicated solutions architecture.
                </p>

                <div>
                  <label className="font-semibold text-[#18191B] block mb-1">Your Name *</label>
                  <input
                    type="text"
                    required
                    value={salesName}
                    onChange={(e) => setSalesName(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-[#E4E4E0] text-xs text-[#18191B] focus:outline-none focus:border-[#FF6B35]"
                    placeholder="e.g. Alex Rivera"
                  />
                </div>

                <div>
                  <label className="font-semibold text-[#18191B] block mb-1">Work Email *</label>
                  <input
                    type="email"
                    required
                    value={salesEmail}
                    onChange={(e) => setSalesEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-[#E4E4E0] text-xs text-[#18191B] focus:outline-none focus:border-[#FF6B35]"
                    placeholder="alex@company.com"
                  />
                </div>

                <div>
                  <label className="font-semibold text-[#18191B] block mb-1">Company & Domain *</label>
                  <input
                    type="text"
                    required
                    value={salesCompany}
                    onChange={(e) => setSalesCompany(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-[#E4E4E0] text-xs text-[#18191B] focus:outline-none focus:border-[#FF6B35]"
                    placeholder="e.g. Acme Corp"
                  />
                </div>

                <div>
                  <label className="font-semibold text-[#18191B] block mb-1">Monthly AI Spend Estimate</label>
                  <select
                    value={salesSpend}
                    onChange={(e) => setSalesSpend(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-[#E4E4E0] text-xs text-[#18191B] bg-white focus:outline-none focus:border-[#FF6B35]"
                  >
                    <option>$10,000 – $50,000 / month</option>
                    <option>$50,000 – $250,000 / month</option>
                    <option>$250,000+ / month</option>
                  </select>
                </div>

                <div className="pt-2 border-t border-[#E4E4E0] flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSalesModal(false)}
                    className="px-3 py-1.5 rounded-md font-semibold text-[#5F6368] hover:bg-[#F3F3F0]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-md font-semibold text-white bg-[#FF6B35] hover:bg-[#E85520] shadow-xs transition-colors"
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
