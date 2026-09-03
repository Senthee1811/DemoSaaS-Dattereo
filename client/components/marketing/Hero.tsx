'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, Check, ShieldCheck, Zap } from 'lucide-react';
import { GatewayMonitorCard } from './GatewayMonitorCard';
import { TeamMemberCard } from './TeamMemberCard';
import { BudgetAlertCard } from './BudgetAlertCard';
import { TrustBadge } from './TrustBadge';
import { LogoStrip } from './LogoStrip';

export function Hero() {
  return (
    <section className="relative w-full py-4 sm:py-6 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Soft Orange Ambient Background Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[950px] h-[550px] bg-gradient-to-br from-[#FFE3D6]/80 via-[#FFD2C0]/50 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-10 right-10 w-[420px] h-[420px] bg-[#FF8A4C]/15 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-10 left-10 w-[480px] h-[480px] bg-[#FF6B35]/12 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Main SaaS Rounded Container (max-width ~1200-1250px, rounded ~38px) */}
      <div className="max-w-[1240px] mx-auto bg-white rounded-[36px] sm:rounded-[42px] border border-[#F0ECE7] saas-container-shadow p-6 sm:p-10 lg:p-12 relative">
        
        {/* Decorative Top Accent Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-[#FF6B35]/40 to-transparent rounded-full" />

        {/* Top Grid: Two-Column Hero Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          
          {/* Left Column: Hero Content & CTA (6 cols) */}
          <div className="lg:col-span-6 space-y-6 sm:space-y-7 text-left">
            
            {/* Eyebrow Badge (small pill, light orange bg) */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF1EA] border border-[#FFD9C7] text-xs font-semibold text-[#FF6B35]">
              <span className="w-2 h-2 rounded-full bg-[#FF6B35] animate-beacon" />
              <span>Real-Time AI Spend Control</span>
            </div>

            {/* Headline (64-78px desktop, tight tracking, 3 lines) */}
            <h1 className="text-4xl sm:text-5xl lg:text-[68px] font-extrabold tracking-tight leading-[1.06] text-[#111111]">
              <span className="text-orange-gradient block">AI spend visibility</span>
              <span className="block">for every team,</span>
              <span className="block text-[#111111]">provider, and project</span>
            </h1>

            {/* Subheadline */}
            <p className="text-base sm:text-lg text-[#555555] max-w-lg leading-relaxed font-normal">
              Track every OpenAI, Gemini, and Claude request in real time — set budgets, catch overspend before it happens, and give every team full accountability for their AI usage.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-1">
              {/* Primary CTA: Start for free */}
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-[15.5px] font-semibold text-white bg-gradient-to-r from-[#FF6B35] via-[#FF7B3D] to-[#FF9A62] shadow-[0_6px_20px_rgba(255,107,53,0.35)] hover:shadow-[0_8px_25px_rgba(255,107,53,0.45)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
              >
                <span>Start for free</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              {/* Secondary CTA: Contact us */}
              <a
                href="#pricing"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-full text-[15.5px] font-medium text-[#222222] bg-white border border-[#E8E8E8] hover:border-[#CCCCCC] hover:bg-[#FAFAFA] transition-all duration-200"
              >
                <span>Contact us</span>
              </a>
            </div>

            {/* Trust Indicators (small text, dot-separated) */}
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-[13px] text-[#777777] pt-1">
              <span>14-day free trial</span>
              <span className="text-[#CCCCCC]">·</span>
              <span>No credit card required</span>
              <span className="text-[#CCCCCC]">·</span>
              <span>Cancel anytime</span>
            </div>
          </div>

          {/* Right Column: Hero Visual (6 cols) */}
          <div className="lg:col-span-6 relative flex items-center justify-center py-6 sm:py-8">
            
            {/* Ambient Backlight for Central Card */}
            <div className="absolute inset-0 bg-gradient-to-tr from-[#FF6B35]/20 to-[#FF8A4C]/10 rounded-full blur-2xl -z-10 scale-90" />

            {/* Floating Decorative Orange Connection Nodes / Rings */}
            <div className="absolute -top-4 -right-2 w-3 h-3 rounded-full bg-[#FF6B35] animate-ping opacity-60 hidden sm:block" />
            <div className="absolute top-1/2 -left-6 w-2.5 h-2.5 rounded-full bg-[#FF8A4C] animate-beacon hidden sm:block" />
            <div className="absolute -bottom-3 right-1/4 w-2 h-2 rounded-full bg-[#FF6B35] opacity-50 hidden sm:block" />

            {/* Floating Team Member Cards (Top & Left area) */}
            <div className="absolute -top-6 -left-4 sm:-top-8 sm:-left-6 z-20 animate-float-slow hidden sm:block">
              <TeamMemberCard
                name="Elena Vance"
                role="Eng Lead"
                statusText="Payments ($1.2k/$3k)"
                statusColor="green"
                avatarUrl="/avatars/elena.jpg"
              />
            </div>

            <div className="absolute top-20 -left-10 z-20 animate-float-delayed hidden md:block">
              <TeamMemberCard
                name="Marcus Thorne"
                role="Platform Admin"
                statusText="Gateway v2.4 (Active)"
                statusColor="green"
                avatarUrl="/avatars/marcus.jpg"
              />
            </div>

            <div className="absolute -bottom-6 -left-2 z-20 animate-float-subtle hidden sm:block">
              <TeamMemberCard
                name="Sarah Chen"
                role="FinOps Lead"
                statusText="Marketing (82% used)"
                statusColor="amber"
                avatarUrl="/avatars/sarah.jpg"
              />
            </div>

            {/* Floating AI Insight Card: Budget Alert (Floating above center-right) */}
            <div className="absolute -top-10 sm:-top-12 -right-2 sm:-right-6 z-30 animate-float-delayed w-full max-w-[280px] sm:max-w-[320px]">
              <BudgetAlertCard />
            </div>

            {/* Central Dark Card: Live Gateway Monitor */}
            <div className="w-full relative z-10 flex justify-center">
              <GatewayMonitorCard />
            </div>

            {/* Floating Trust Badge (Bottom-left area) */}
            <div className="absolute -bottom-8 right-2 sm:right-6 z-20 animate-float-slow">
              <TrustBadge />
            </div>
          </div>

        </div>

        {/* Bottom: Trust & Logo Section */}
        <LogoStrip />

      </div>
    </section>
  );
}
