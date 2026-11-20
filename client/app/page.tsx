'use client';

import React from 'react';
import { 
  Navbar, 
  Hero, 
  InteractiveGatewayDemo, 
  FeaturesGrid, 
  HowItWorks, 
  PricingSection, 
  FaqSection, 
  CtaBanner, 
  Footer 
} from '@/components/marketing';

export default function MarketingLandingPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#141413] overflow-x-hidden flex flex-col justify-between selection:bg-[#FF6B35] selection:text-white">
      {/* Top Navigation */}
      <Navbar />

      {/* Main Content Sections */}
      <main className="flex-1 w-full space-y-4 sm:space-y-6">
        {/* Primary Hero Section */}
        <Hero />

        {/* Live Interactive Gateway Sandbox Demo */}
        <InteractiveGatewayDemo />

        {/* Core Value Pillars & Governance Capabilities */}
        <FeaturesGrid />

        {/* 3-Step Setup & Integration Workflow */}
        <HowItWorks />

        {/* Transparent Pricing Plans */}
        <PricingSection />

        {/* FAQ Accordion */}
        <FaqSection />

        {/* Architecture Guarantees Final CTA */}
        <CtaBanner />
      </main>

      {/* Full Footer */}
      <Footer />
    </div>
  );
}
