'use client';

import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  CheckCircle2, 
  Sparkles, 
  ShieldCheck, 
  ArrowRight, 
  Receipt, 
  Calendar, 
  Building2,
  Check,
  AlertCircle,
  ExternalLink,
  Zap,
  HelpCircle
} from 'lucide-react';
import { CardSkeleton } from '@/components/ui/LoadingSkeleton';

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
  const [orgName, setOrgName] = useState('Apex Innovations');
  const [orgId, setOrgId] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('spendguard_user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          if (user.orgName) setOrgName(user.orgName);
          if (user.orgId) setOrgId(user.orgId);
        } catch {}
      }
    }
  }, []);

  useEffect(() => {
    async function fetchSub() {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
        const res = await fetch(`/api/v1/billing/subscription${orgId ? `?orgId=${orgId}` : ''}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setSubData(data);
        }
      } catch (err) {
        console.error('Failed to load subscription:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchSub();
  }, [orgId]);

  const handleCheckout = async (tier: 'starter' | 'growth' | 'enterprise') => {
    if (tier === 'enterprise') {
      setShowEnterpriseModal(true);
      return;
    }

    setCheckoutLoading(tier);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
      const res = await fetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          orgId: orgId || 'default-org',
          tier,
          successUrl: `${window.location.origin}/dashboard?checkout=success`,
          cancelUrl: `${window.location.origin}/dashboard?checkout=cancelled`,
        }),
      });

      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        alert('Checkout session could not be created. Please try again.');
      }
    } catch (err: any) {
      alert(`Checkout failed: ${err.message}`);
    } finally {
      setCheckoutLoading(null);
    }
  };

  const plans = [
    {
      id: 'starter' as const,
      name: 'Starter',
      price: annual ? 31 : 39,
      description: 'Ideal for early-stage products and indie teams deploying their first AI features.',
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
      description: 'Designed for scaling SaaS and high-volume multi-agent production infrastructure.',
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
      description: 'Full custom governance, VPC deployment, and enterprise security compliance.',
      features: [
        'Dedicated customer VPC proxy gateway',
        'Multi-million requests with 99.99% SLA',
        'SAML SSO & SCIM Directory sync (Phase 4)',
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
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 sm:p-8 bg-gradient-to-r from-white via-[#FFF8F5] to-white rounded-3xl border border-[#E8E8E8] shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[#FFF1EA] text-[#FF6B35] border border-[#FFD9C7]">
              Billing & Subscriptions
            </span>
            <span className="text-xs text-[#777777] font-medium flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" />
              {orgName}
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-[#111111] tracking-tight">
            Plans & Governance Tiers
          </h2>
          <p className="text-sm text-[#666666] max-w-xl">
            Scale your AI governance seamlessly. Switch plans anytime with pro-rated billing handled securely via Stripe.
          </p>
        </div>

        {/* Current Active Plan Badge */}
        <div className="flex items-center gap-3.5 p-4 bg-white rounded-2xl border border-[#E8E8E8] shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF6B35] to-[#FF8A4C] text-white flex items-center justify-center font-bold">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[#777777] uppercase tracking-wider">Current Plan</div>
            <div className="text-sm font-extrabold text-[#111111] capitalize flex items-center gap-1.5">
              <span>{currentTier} Plan</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ECFDF5] text-emerald-700 border border-emerald-200">
                {subData?.status || 'Active'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Annual / Monthly Toggle */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <span className={`text-sm font-semibold ${!annual ? 'text-[#111111]' : 'text-[#777777]'}`}>
          Monthly Billing
        </span>
        <button
          type="button"
          onClick={() => setAnnual(!annual)}
          className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            annual ? 'bg-[#FF6B35]' : 'bg-[#E8E8E8]'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              annual ? 'translate-x-6' : 'translate-x-0'
            }`}
          />
        </button>
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-semibold ${annual ? 'text-[#111111]' : 'text-[#777777]'}`}>
            Annual Billing
          </span>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-[#ECFDF5] text-emerald-700 border border-emerald-200">
            Save 20%
          </span>
        </div>
      </div>

      {/* Plan Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = currentTier === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col justify-between p-6 sm:p-7 rounded-3xl bg-white transition-all duration-200 ${
                  plan.popular
                    ? 'border-2 border-[#FF6B35] shadow-lg shadow-[#FF6B35]/10'
                    : 'border border-[#E8E8E8] shadow-sm hover:border-[#FFD9C7]'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-bold text-white bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] shadow-sm flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>Recommended for Scale</span>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-[#111111]">{plan.name}</h3>
                    {isCurrent && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FFF1EA] text-[#FF6B35] border border-[#FFD9C7]">
                        Active Tier
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[#666666] leading-relaxed min-h-[36px]">
                    {plan.description}
                  </p>

                  <div className="pt-2 flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-extrabold text-[#111111]">
                      ${plan.price}
                    </span>
                    <span className="text-xs font-semibold text-[#777777]">/ month</span>
                    {annual && (
                      <span className="text-[11px] text-[#999999] ml-1">billed annually</span>
                    )}
                  </div>

                  <div className="pt-4 border-t border-[#F0ECE7] space-y-2.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#888888]">
                      Included Features
                    </div>
                    {plan.features.map((feat, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-xs text-[#444444]">
                        <Check className="w-4 h-4 text-[#FF6B35] shrink-0 mt-0.5 stroke-[2.5]" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6 mt-6 border-t border-[#F0ECE7]">
                  {isCurrent ? (
                    <button
                      type="button"
                      disabled
                      className="w-full py-3 px-4 rounded-xl text-center font-bold text-xs bg-[#F6F6F6] text-[#888888] cursor-default flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Current Active Plan</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCheckout(plan.id)}
                      disabled={checkoutLoading === plan.id}
                      className={`w-full py-3 px-4 rounded-xl text-center font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                        plan.popular
                          ? 'bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] text-white shadow-md shadow-[#FF6B35]/25 hover:shadow-lg hover:shadow-[#FF6B35]/35 hover:scale-[1.01]'
                          : 'bg-[#111111] hover:bg-[#222222] text-white'
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
        {/* Payment Method */}
        <div className="p-6 bg-white rounded-3xl border border-[#E8E8E8] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-[#111111] flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#FF6B35]" />
              <span>Payment Method</span>
            </h4>
            <span className="text-[11px] font-semibold text-[#888888]">Stripe Managed</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#FFF8F5] border border-[#FFD9C7] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-7 bg-white rounded-md border border-[#E8E8E8] flex items-center justify-center font-bold text-[10px] text-blue-800">
                VISA
              </div>
              <div>
                <div className="text-xs font-bold text-[#111111]">•••• •••• •••• 4242</div>
                <div className="text-[11px] text-[#777777]">Expires 12/28</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ECFDF5] text-emerald-700">
              Default
            </span>
          </div>

          <p className="text-[11px] text-[#777777]">
            Payments are securely routed via Stripe's encrypted PCI-DSS Level 1 compliance infrastructure.
          </p>
        </div>

        {/* Recent Invoices Ledger */}
        <div className="md:col-span-2 p-6 bg-white rounded-3xl border border-[#E8E8E8] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-[#111111] flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[#FF6B35]" />
              <span>Recent Invoices</span>
            </h4>
            <span className="text-xs text-[#777777] font-medium">Auto-generated monthly</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#F0ECE7] text-[#888888] font-bold">
                  <th className="pb-2">Invoice #</th>
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0ECE7] text-[#444444]">
                <tr>
                  <td className="py-3 font-semibold text-[#111111]">INV-2026-003</td>
                  <td className="py-3">Nov 01, 2026</td>
                  <td className="py-3 font-semibold">$39.00 USD</td>
                  <td className="py-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ECFDF5] text-emerald-700">
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
                  <td className="py-3 font-semibold text-[#111111]">INV-2026-002</td>
                  <td className="py-3">Oct 01, 2026</td>
                  <td className="py-3 font-semibold">$39.00 USD</td>
                  <td className="py-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ECFDF5] text-emerald-700">
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-7 border border-[#E8E8E8] shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FFF1EA] border border-[#FFD9C7] text-[#FF6B35] flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-[#111111]">Enterprise Qualification</h3>
              </div>
              <button
                type="button"
                onClick={() => { setShowEnterpriseModal(false); setEnterpriseSubmitted(false); }}
                className="text-xs font-bold text-[#888888] hover:text-[#111111] p-1"
              >
                ✕
              </button>
            </div>

            {enterpriseSubmitted ? (
              <div className="p-6 text-center space-y-3 bg-[#ECFDF5] rounded-2xl border border-emerald-200">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h4 className="text-sm font-bold text-emerald-900">Enterprise Inquiry Received</h4>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  A SpendGuard FinOps Solutions Architect will reach out to schedule your custom architecture review and VPC proxy deployment sizing within 2 hours.
                </p>
                <button
                  type="button"
                  onClick={() => { setShowEnterpriseModal(false); setEnterpriseSubmitted(false); }}
                  className="px-4 py-2 bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs hover:bg-emerald-800"
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
                <p className="text-[#666666] leading-relaxed">
                  Enterprise plans include custom VPC proxy deployments, SAML SSO/SCIM, tailored SLA guarantees, and multi-tenant security reviews.
                </p>

                <div className="space-y-1">
                  <label className="font-bold text-[#333333]">Company & Domain</label>
                  <input
                    type="text"
                    required
                    defaultValue={orgName}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E8E8] focus:border-[#FF6B35] focus:outline-none"
                    placeholder="e.g. Acme Corp (acme.com)"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#333333]">Estimated Monthly AI Spend</label>
                  <select className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E8E8] focus:border-[#FF6B35] focus:outline-none">
                    <option>$10,000 – $50,000 / month</option>
                    <option>$50,000 – $250,000 / month</option>
                    <option>$250,000+ / month</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#333333]">Primary Architecture Requirements</label>
                  <div className="space-y-2 pt-1 text-[#555555]">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded text-[#FF6B35]" />
                      <span>Dedicated self-hosted VPC proxy gateway (zero data egress)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded text-[#FF6B35]" />
                      <span>Okta / Azure AD SAML 2.0 SSO & SCIM provisioning</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="rounded text-[#FF6B35]" />
                      <span>Custom SOC2 / HIPAA Business Associate Agreement</span>
                    </label>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowEnterpriseModal(false)}
                    className="px-4 py-2.5 rounded-xl font-bold text-[#666666] hover:bg-[#F6F6F6]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] shadow-md shadow-[#FF6B35]/25 hover:shadow-lg hover:shadow-[#FF6B35]/35"
                  >
                    Submit Enterprise Inquiry
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

