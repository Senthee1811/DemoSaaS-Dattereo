'use client';

import React from 'react';
import { 
  Navbar, 
  Hero, 
  InteractiveGatewayDemo, 
  FeaturesGrid, 
  HowItWorks, 
  PricingSection, 
  TestimonialsSection, 
  FaqSection, 
  CtaBanner, 
  Footer 
} from '@/components/marketing';

export default function MarketingLandingPage() {
  return (
    <div className="min-h-screen bg-[#FFF9F6] text-[#111111] overflow-x-hidden flex flex-col justify-between selection:bg-[#FF6B35] selection:text-white">
      {/* Top Navigation */}
      <Navbar />

      {/* Main Content Sections */}
      <main className="flex-1 w-full space-y-4 sm:space-y-6">
        {/* Primary Hero Section with Large Rounded Container & Floating AI Governance Composition */}
        <Hero />

        {/* Live Interactive Gateway Sandbox Demo */}
        <InteractiveGatewayDemo />

        {/* Core Value Pillars & Governance Capabilities */}
        <FeaturesGrid />

        {/* 3-Step Setup & Integration Workflow */}
        <HowItWorks />

        {/* Transparent Pricing Plans */}
        <PricingSection />

        {/* Customer Social Proof & Testimonials */}
        <TestimonialsSection />

        {/* FAQ Accordion */}
        <FaqSection />

        {/* High-Converting Final Call to Action */}
        <CtaBanner />
      </main>

      {/* Full Footer */}
      <Footer />
    </div>
  );
}
