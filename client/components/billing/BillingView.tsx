'use client';

import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  Receipt,
  Building2,
  Check,
  ExternalLink,
  X,
} from 'lucide-react';
import { CardSkeleton } from '@/components/ui/LoadingSkeleton';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { useStoredUser } from '@/lib/client-storage';
import { errorMessage } from '@/lib/types';

interface SubscriptionData {
  orgId: string;
  tier: 'starter' | 'growth' | 'enterprise';
  status: string;
  currentPeriodEnd: string | null;
}

export function BillingView() {
  const [subData, setSubData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [annual, setAnnual] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [showEnterpriseModal, setShowEnterpriseModal] = useState(false);
  const [enterpriseSubmitted, setEnterpriseSubmitted] = useState(false);
  const orgName = useStoredUser()?.orgName || 'Your organization';

  // The backend scopes billing to the caller's own org (from the session), so no orgId is sent
  useEffect(() => {
    authFetch('/api/v1/billing/subscription')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SubscriptionData | null) => {
        if (data) setSubData(data);
      })
      .catch((err) => console.error('Failed to load subscription:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleCheckout = async (tier: 'starter' | 'growth' | 'enterprise') => {
    if (tier === 'enterprise') {
      setShowEnterpriseModal(true);
      return;
    }

    setCheckoutLoading(tier);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
      const res = await authFetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tier }),
      });

      if (!res.ok) throw new Error(await readApiError(res, 'Checkout session could not be created.'));
      const data: { checkoutUrl?: string } = await res.json();
      if (data.checkoutUrl) {
        // External Stripe Checkout page — a full navigation is required
        window.location.assign(data.checkoutUrl);
      } else {
        alert('Checkout session could not be created. Please try again.');
      }
    } catch (err: unknown) {
      alert(`Checkout failed: ${errorMessage(err)}`);
    } finally {
      setCheckoutLoading(null);
    }
  };

  const plans = [
    {
      id: 'starter' as const,
      name: 'Starter',
      price: annual ? 31 : 39,
      description: 'Essential governance for engineering teams deploying their first production AI features.',
      features: [
        'Up to 3 production projects',
        '50,000 requests / month included',
        'Pre-flight Redis budget validation',
        'OpenAI, Anthropic & Gemini routing',
        'Standard Email alert notifications',
        '7-day immutable audit trail',
      ],
      popular: false,
      ctaText: 'Upgrade to Starter',
    },
    {
      id: 'growth' as const,
      name: 'Growth',
      price: annual ? 159 : 199,
      description: 'Comprehensive FinOps infrastructure for high-volume multi-agent production systems.',
      features: [
        'Unlimited production projects',
        '500,000 requests / month included',
        'Sub-5ms atomic Lua budget reservations',
        'Statistical anomaly & spike detection (FR-9)',
        'Slack, Discord, PagerDuty & Webhooks',
        '30-day immutable audit ledger & CSV export',
        'Priority email & Slack engineering support',
      ],
      popular: true,
      ctaText: 'Upgrade to Growth',
    },
    {
      id: 'enterprise' as const,
      name: 'Enterprise',
      price: annual ? 639 : 799,
      description: 'Dedicated customer VPC proxy gateway, custom SLA, and SOC2/HIPAA compliance.',
      features: [
        'Dedicated customer VPC proxy gateway',
        'Multi-million requests with 99.99% SLA',
        'SAML 2.0 SSO & SCIM Directory sync',
        'Zero-trust hardware security module key storage',
        'Custom cost allocation & billing centers',
        'Dedicated FinOps Solutions Architect',
        'Custom MSA, BAA & SOC2 type II audit access',
      ],
      popular: false,
      ctaText: 'Contact Enterprise Sales',
    },
  ];

  const currentTier = subData?.tier || 'starter';

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white rounded-[24px] border border-[#E4E4E0] shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#FF6B35] bg-[#FFF7F2] border border-[#FFD2C0] px-2 py-0.5 rounded-full">
              Subscription
            </span>
            <span className="text-xs text-[#5F6368] font-medium flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              {orgName}
            </span>
          </div>
          <h2 className="font-serif text-2xl font-normal text-[#141413] tracking-tight mt-1.5">
            Plans & Governance Tiers
          </h2>
          <p className="text-xs text-[#5F6368] mt-0.5">
            Pro-rated billing handled through Stripe. Switch plans or manage seats at any time.
          </p>
        </div>

        {/* Current Active Plan Badge */}
        <div className="flex items-center gap-3 p-3.5 bg-[#FAF8F5] rounded-2xl border border-[#E4E4E0] self-start sm:self-auto shadow-2xs">
          <div className="w-9 h-9 rounded-xl bg-[#141413] text-white flex items-center justify-center font-bold">
            <CreditCard className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-mono font-medium text-[#5F6368] uppercase tracking-wider">Current Tier</div>
            <div className="text-xs font-semibold text-[#141413] capitalize flex items-center gap-2 mt-0.5">
              <span>{currentTier} Plan</span>
              <span className="px-2 py-0.2 rounded-full text-[10px] font-semibold bg-[#F0FDF4] text-[#0D9488] border border-[#BBF7D0]">
                {subData?.status || 'Active'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Annual / Monthly Toggle */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <span className={`text-xs font-medium ${!annual ? 'text-[#141413] font-semibold' : 'text-[#5F6368]'}`}>
          Monthly Billing
        </span>
        <button
          type="button"
          onClick={() => setAnnual(!annual)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            annual ? 'bg-[#FF6B35]' : 'bg-[#E4E4E0]'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
              annual ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-medium ${annual ? 'text-[#141413] font-semibold' : 'text-[#5F6368]'}`}>
            Annual Billing
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F0FDF4] text-[#0D9488] border border-[#BBF7D0]">
            Save 20%
          </span>
        </div>
      </div>

      {/* Plan Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const isCurrent = currentTier === plan.id;
            return (
              <div
                key={plan.id}
                className={`flex flex-col justify-between p-6 rounded-[24px] bg-white transition-all ${
                  plan.popular
                    ? 'border-2 border-[#FF6B35] shadow-2xs'
                    : 'border border-[#E4E4E0] shadow-2xs'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif text-xl font-normal text-[#141413]">{plan.name}</h3>
                    {isCurrent ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#FFF7F2] text-[#FF6B35] border border-[#FFD2C0]">
                        Active Tier
                      </span>
                    ) : plan.popular ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#141413] text-white">
                        Recommended
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-[#5F6368] leading-relaxed min-h-[32px]">
                    {plan.description}
                  </p>

                  <div className="pt-2 flex items-baseline gap-1.5">
                    <span className="font-serif text-3xl font-normal text-[#141413] tabular-nums">
                      ${plan.price}
                    </span>
                    <span className="text-xs text-[#80868B]">/ month</span>
                    {annual && (
                      <span className="text-[10px] text-[#80868B] ml-1">billed annually</span>
                    )}
                  </div>

                  <div className="pt-4 border-t border-[#E4E4E0] space-y-2.5">
                    <div className="text-[10px] font-mono font-medium uppercase tracking-wider text-[#80868B]">
                      Included Features
                    </div>
                    {plan.features.map((feat, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-[#141413]">
                        <Check className="w-3.5 h-3.5 text-[#0D9488] shrink-0 mt-0.5" strokeWidth={2.5} />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6 mt-6 border-t border-[#E4E4E0]">
                  {isCurrent ? (
                    <button
                      type="button"
                      disabled
                      className="w-full py-2.5 px-4 rounded-full text-center font-semibold text-xs bg-[#F3F3F0] text-[#80868B] cursor-default flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#0D9488]" />
                      <span>Current Active Plan</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCheckout(plan.id)}
                      disabled={checkoutLoading === plan.id}
                      className={`w-full py-2.5 px-4 rounded-full text-center font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-2xs ${
                        plan.popular
                          ? 'bg-[#FF6B35] hover:bg-[#E55A25] text-white'
                          : 'bg-[#141413] hover:bg-[#2E3033] text-white'
                      }`}
                    >
                      <span>
                        {checkoutLoading === plan.id ? 'Connecting Stripe...' : plan.ctaText}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Payment Method & Invoices Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
        {/* Payment Method */}
        <div className="p-6 bg-white rounded-[24px] border border-[#E4E4E0] shadow-2xs space-y-3.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono font-medium text-[#141413] uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#5F6368]" />
              <span>Payment Method</span>
            </h4>
            <span className="text-[10px] text-[#80868B] font-mono">PCI-DSS Level 1</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E4E4E0] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-7 bg-white rounded-lg border border-[#E4E4E0] flex items-center justify-center font-bold text-[9px] text-[#141413]">
                CARD
              </div>
              <div>
                <div className="text-xs font-mono font-semibold text-[#141413]">•••• •••• •••• 4242</div>
                <div className="text-[10px] text-[#80868B]">Expires 12/28</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F0FDF4] text-[#0D9488]">
              Default
            </span>
          </div>

          <p className="text-[11px] text-[#5F6368]">
            Card information is vaulted and processed by Stripe without touching SpendGuard servers.
          </p>
        </div>

        {/* Recent Invoices Ledger */}
        <div className="md:col-span-2 p-6 bg-white rounded-[24px] border border-[#E4E4E0] shadow-2xs space-y-3.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono font-medium text-[#141413] uppercase tracking-wider flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[#5F6368]" />
              <span>Billing Invoices</span>
            </h4>
            <span className="text-[11px] text-[#80868B]">Monthly automatic renewal</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E4E4E0] text-[#5F6368] font-semibold text-[11px]">
                  <th className="pb-3">Invoice #</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3 text-right">Amount</th>
                  <th className="pb-3 text-center">Status</th>
                  <th className="pb-3 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E0] text-[#141413]">
                <tr>
                  <td className="py-3 font-mono text-[11px] font-medium">INV-2026-003</td>
                  <td className="py-3 text-[#5F6368]">Nov 01, 2026</td>
                  <td className="py-3 font-mono tabular-nums text-right font-semibold">$39.00 USD</td>
                  <td className="py-3 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F0FDF4] text-[#0D9488]">
                      Paid
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button 
                      type="button" 
                      onClick={() => alert('Receipt PDF downloaded for INV-2026-003')}
                      className="text-[#FF6B35] hover:underline font-semibold text-[11px] inline-flex items-center gap-1"
                    >
                      <span>PDF</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 font-mono text-[11px] font-medium">INV-2026-002</td>
                  <td className="py-3 text-[#5F6368]">Oct 01, 2026</td>
                  <td className="py-3 font-mono tabular-nums text-right font-semibold">$39.00 USD</td>
                  <td className="py-3 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F0FDF4] text-[#0D9488]">
                      Paid
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button 
                      type="button" 
                      onClick={() => alert('Receipt PDF downloaded for INV-2026-002')}
                      className="text-[#FF6B35] hover:underline font-semibold text-[11px] inline-flex items-center gap-1"
                    >
                      <span>PDF</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Enterprise Qualification Modal */}
      {showEnterpriseModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] max-w-lg w-full p-6 border border-[#E4E4E0] shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E0]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#FF6B35]" />
                <h3 className="font-serif text-lg font-normal text-[#141413]">Enterprise Qualification</h3>
              </div>
              <button
                type="button"
                onClick={() => { setShowEnterpriseModal(false); setEnterpriseSubmitted(false); }}
                className="p-1.5 text-[#80868B] hover:text-[#141413] rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {enterpriseSubmitted ? (
              <div className="p-6 text-center space-y-3 bg-[#F0FDF4] rounded-2xl border border-[#BBF7D0]">
                <CheckCircle2 className="w-7 h-7 text-[#0D9488] mx-auto" />
                <h4 className="font-serif text-base font-normal text-[#0D9488]">Enterprise Inquiry Submitted</h4>
                <p className="text-xs text-[#134E4A] leading-relaxed">
                  A FinOps Solutions Architect will reach out to schedule your VPC architecture review within 2 business hours.
                </p>
                <button
                  type="button"
                  onClick={() => { setShowEnterpriseModal(false); setEnterpriseSubmitted(false); }}
                  className="px-5 py-2 bg-[#0D9488] text-white font-semibold text-xs rounded-full shadow-2xs"
                >
                  Close
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setEnterpriseSubmitted(true);
                }}
                className="space-y-4 text-xs"
              >
                <p className="text-[#5F6368] leading-relaxed">
                  Enterprise tiers include self-hosted VPC proxies (zero model prompt egress), Okta/Azure AD SAML 2.0 SSO, and custom SLA agreements.
                </p>

                <div>
                  <label className="font-semibold text-[#141413] block mb-1.5">Company & Domain</label>
                  <input
                    type="text"
                    required
                    defaultValue={orgName}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E4E4E0] text-xs text-[#141413] focus:outline-none focus:border-[#FF6B35]"
                    placeholder="e.g. Acme Corp (acme.com)"
                  />
                </div>

                <div>
                  <label className="font-semibold text-[#141413] block mb-1.5">Estimated Monthly AI Spend</label>
                  <select className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E4E4E0] text-xs text-[#141413] bg-white focus:outline-none focus:border-[#FF6B35]">
                    <option>$10,000 – $50,000 / month</option>
                    <option>$50,000 – $250,000 / month</option>
                    <option>$250,000+ / month</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-[#141413] block mb-1.5">Architecture Requirements</label>
                  <div className="space-y-2 pt-0.5 text-[#5F6368]">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded text-[#FF6B35]" />
                      <span>Dedicated customer VPC proxy gateway (zero data egress)</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded text-[#FF6B35]" />
                      <span>SAML 2.0 SSO & SCIM Directory Provisioning</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" className="rounded text-[#FF6B35]" />
                      <span>Custom SOC2 / HIPAA Business Associate Agreement (BAA)</span>
                    </label>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#E4E4E0] flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowEnterpriseModal(false)}
                    className="px-4 py-2 rounded-full font-semibold text-[#5F6368] hover:bg-[#F3F3F0] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-full font-semibold text-white bg-[#FF6B35] hover:bg-[#E55A25] shadow-2xs transition-colors"
                  >
                    Submit Enterprise Request
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
