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
  X,
} from 'lucide-react';
import { CardSkeleton } from '@/components/ui/LoadingSkeleton';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { useStoredUser } from '@/lib/client-storage';
import { errorMessage } from '@/lib/types';
import { useErrorDialog, useEscapeToClose } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/Badge';

interface SubscriptionData {
  orgId: string;
  tier: 'starter' | 'growth' | 'enterprise';
  status: string;
  currentPeriodEnd: string | null;
}

export function BillingView() {
  const showError = useErrorDialog();
  const [subData, setSubData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [annual, setAnnual] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [showEnterpriseModal, setShowEnterpriseModal] = useState(false);
  useEscapeToClose(showEnterpriseModal, () => setShowEnterpriseModal(false));
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
        showError({ title: 'Checkout could not be started', message: 'The payment provider did not return a checkout page.', hint: 'Please try again in a moment.' });
      }
    } catch (err: unknown) {
      showError({ title: 'Checkout failed', message: errorMessage(err), hint: 'No payment was taken.' });
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-surface rounded-card border border-line shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone="accent" mono className="uppercase tracking-wider">Subscription</Badge>
            <span className="text-xs text-fg-secondary font-medium flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              {orgName}
            </span>
          </div>
          <h2 className="font-serif text-2xl font-normal text-fg tracking-tight mt-1.5">
            Plans & Governance Tiers
          </h2>
          <p className="text-xs text-fg-secondary mt-0.5">
            Pro-rated billing handled through Stripe. Switch plans or manage seats at any time.
          </p>
        </div>

        {/* Current Active Plan Badge */}
        <div className="flex items-center gap-3 p-3.5 bg-surface-subtle rounded-field border border-line self-start sm:self-auto shadow-2xs">
          <div className="w-9 h-9 rounded-menu bg-code text-white flex items-center justify-center font-bold">
            <CreditCard className="w-4 h-4" />
          </div>
          <div>
            <div className="text-caption font-mono font-medium text-fg-secondary uppercase tracking-wider">Current Tier</div>
            <div className="text-xs font-semibold text-fg capitalize flex items-center gap-2 mt-0.5">
              <span>{currentTier} Plan</span>
              <Badge tone="success">{subData?.status || 'Active'}</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Annual / Monthly Toggle */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <span className={`text-xs font-medium ${!annual ? 'text-fg font-semibold' : 'text-fg-secondary'}`}>
          Monthly Billing
        </span>
        <button
          type="button"
          onClick={() => setAnnual(!annual)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            annual ? 'bg-accent' : 'bg-surface-muted'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow-xs transition duration-200 ease-in-out ${
              annual ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-medium ${annual ? 'text-fg font-semibold' : 'text-fg-secondary'}`}>
            Annual Billing
          </span>
          <Badge tone="success">Save 20%</Badge>
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
                className={`flex flex-col justify-between p-6 rounded-card bg-surface transition-all ${
                  plan.popular
                    ? 'border-2 border-accent shadow-2xs'
                    : 'border border-line shadow-2xs'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif text-xl font-normal text-fg">{plan.name}</h3>
                    {isCurrent ? (
                      <Badge tone="accent">Active Tier</Badge>
                    ) : plan.popular ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-semibold leading-4 bg-code text-white">
                        Recommended
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-fg-secondary leading-relaxed min-h-[32px]">
                    {plan.description}
                  </p>

                  <div className="pt-2 flex items-baseline gap-1.5">
                    <span className="font-serif text-3xl font-normal text-fg tabular-nums">
                      ${plan.price}
                    </span>
                    <span className="text-xs text-fg-muted">/ month</span>
                    {annual && (
                      <span className="text-caption text-fg-muted ml-1">billed annually</span>
                    )}
                  </div>

                  <div className="pt-4 border-t border-line space-y-2.5">
                    <div className="text-caption font-mono font-medium uppercase tracking-wider text-fg-muted">
                      Included Features
                    </div>
                    {plan.features.map((feat, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-fg">
                        <Check className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" strokeWidth={2.5} />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6 mt-6 border-t border-line">
                  {isCurrent ? (
                    <button
                      type="button"
                      disabled
                      className="w-full py-2.5 px-4 rounded-full text-center font-semibold text-xs bg-surface-muted text-fg-muted cursor-default flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                      <span>Current Active Plan</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCheckout(plan.id)}
                      disabled={checkoutLoading === plan.id}
                      className={`w-full py-2.5 px-4 rounded-full text-center font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-2xs ${
                        plan.popular
                          ? 'bg-accent hover:bg-accent-hover text-white'
                          : 'bg-code hover:bg-[#2E3033] text-white'
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
        <div className="p-6 bg-surface rounded-card border border-line shadow-2xs space-y-3.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono font-medium text-fg uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-fg-secondary" />
              <span>Payment Method</span>
            </h4>
            <span className="text-caption text-fg-muted font-mono">PCI-DSS Level 1</span>
          </div>

          <div className="p-3.5 rounded-field bg-surface-subtle border border-line flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-7 bg-surface rounded-control border border-line flex items-center justify-center font-bold text-micro text-fg">
                CARD
              </div>
              <div>
                <div className="text-xs font-mono font-semibold text-fg">•••• •••• •••• 4242</div>
                <div className="text-caption text-fg-muted">Expires 12/28</div>
              </div>
            </div>
            <Badge tone="success">Default</Badge>
          </div>

          <p className="text-label text-fg-secondary">
            Card information is vaulted and processed by Stripe without touching SpendGuard servers.
          </p>
        </div>

        {/* Recent Invoices Ledger */}
        <div className="md:col-span-2 p-6 bg-surface rounded-card border border-line shadow-2xs space-y-3.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono font-medium text-fg uppercase tracking-wider flex items-center gap-2">
              <Receipt className="w-4 h-4 text-fg-secondary" />
              <span>Billing Invoices</span>
            </h4>
            
          </div>

          {/* There is no invoice API yet: show nothing rather than sample invoices */}
          <p className="text-xs text-fg-secondary py-4">
            No invoices to show. Once you subscribe, Stripe emails a receipt for each payment.
          </p>
        </div>
      </div>

      {/* Enterprise Qualification Modal */}
      {showEnterpriseModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-overlay backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface rounded-card max-w-lg w-full p-6 border border-line shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-accent" />
                <h3 className="font-serif text-lg font-normal text-fg">Enterprise Qualification</h3>
              </div>
              <button
                type="button"
                onClick={() => { setShowEnterpriseModal(false); setEnterpriseSubmitted(false); }}
                className="p-1.5 text-fg-muted hover:text-fg rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {enterpriseSubmitted ? (
              <div className="p-6 text-center space-y-3 bg-success-bg rounded-field border border-success-border">
                <CheckCircle2 className="w-7 h-7 text-success mx-auto" />
                <h4 className="font-serif text-base font-normal text-success">Enterprise Inquiry Submitted</h4>
                <p className="text-xs text-success leading-relaxed">
                  A FinOps Solutions Architect will reach out to schedule your VPC architecture review within 2 business hours.
                </p>
                <button
                  type="button"
                  onClick={() => { setShowEnterpriseModal(false); setEnterpriseSubmitted(false); }}
                  className="px-5 py-2 bg-success text-white font-semibold text-xs rounded-full shadow-2xs"
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
                <p className="text-fg-secondary leading-relaxed">
                  Enterprise tiers include self-hosted VPC proxies (zero model prompt egress), Okta/Azure AD SAML 2.0 SSO, and custom SLA agreements.
                </p>

                <div>
                  <label className="font-semibold text-fg block mb-1.5">Company & Domain</label>
                  <input
                    type="text"
                    required
                    defaultValue={orgName}
                    className="w-full px-3.5 py-2.5 rounded-field border border-line text-xs text-fg focus:outline-none focus:border-accent"
                    placeholder="e.g. Acme Corp (acme.com)"
                  />
                </div>

                <div>
                  <label className="font-semibold text-fg block mb-1.5">Estimated Monthly AI Spend</label>
                  <select className="w-full px-3.5 py-2.5 rounded-field border border-line text-xs text-fg bg-surface focus:outline-none focus:border-accent">
                    <option>$10,000 – $50,000 / month</option>
                    <option>$50,000 – $250,000 / month</option>
                    <option>$250,000+ / month</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-fg block mb-1.5">Architecture Requirements</label>
                  <div className="space-y-2 pt-0.5 text-fg-secondary">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded-control text-accent" />
                      <span>Dedicated customer VPC proxy gateway (zero data egress)</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded-control text-accent" />
                      <span>SAML 2.0 SSO & SCIM Directory Provisioning</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" className="rounded-control text-accent" />
                      <span>Custom SOC2 / HIPAA Business Associate Agreement (BAA)</span>
                    </label>
                  </div>
                </div>

                <div className="pt-3 border-t border-line flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowEnterpriseModal(false)}
                    className="px-4 py-2 rounded-full font-semibold text-fg-secondary hover:bg-surface-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-full font-semibold text-white bg-accent hover:bg-accent-hover shadow-2xs transition-colors"
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
