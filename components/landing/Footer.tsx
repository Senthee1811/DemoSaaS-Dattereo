'use client';

import React from 'react';
import { Sparkles, ArrowRight, ShieldCheck, Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="w-full border-t border-[#F0ECE7] bg-white pt-14 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-[1240px] mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          {/* Brand Column (2 cols on desktop) */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#FF6B35] to-[#FF8A4C] flex items-center justify-center text-white shadow-sm shadow-[#FF6B35]/20">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex items-baseline space-x-1">
                <span className="text-xl font-extrabold text-[#111111] tracking-tight">Aura</span>
                <span className="text-xl font-extrabold text-[#FF6B35] tracking-tight">AI</span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[#666666] max-w-sm leading-relaxed">
              Real-time conversational intelligence for forward-thinking engineering, product, and leadership teams.
            </p>

            <div className="flex items-center space-x-2 text-xs text-emerald-600 font-semibold pt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>All Systems Operational • Sub-180ms Latency</span>
            </div>
          </div>

          {/* Product Links */}
          <div className="space-y-3 text-xs sm:text-sm">
            <p className="font-bold text-[#111111] uppercase tracking-wider text-xs">Product</p>
            <ul className="space-y-2 text-[#666666]">
              <li><a href="#features" className="hover:text-[#FF6B35] transition-colors">Real-Time Intelligence</a></li>
              <li><a href="#features" className="hover:text-[#FF6B35] transition-colors">Automated Action Items</a></li>
              <li><a href="#features" className="hover:text-[#FF6B35] transition-colors">Live Translation</a></li>
              <li><a href="#pricing" className="hover:text-[#FF6B35] transition-colors">Integrations</a></li>
              <li><a href="#pricing" className="hover:text-[#FF6B35] transition-colors">Pricing Plans</a></li>
            </ul>
          </div>

          {/* Company Links */}
          <div className="space-y-3 text-xs sm:text-sm">
            <p className="font-bold text-[#111111] uppercase tracking-wider text-xs">Company</p>
            <ul className="space-y-2 text-[#666666]">
              <li><a href="#about" className="hover:text-[#FF6B35] transition-colors">About Us</a></li>
              <li><a href="#careers" className="hover:text-[#FF6B35] transition-colors">Careers</a></li>
              <li><a href="#blog" className="hover:text-[#FF6B35] transition-colors">Engineering Blog</a></li>
              <li><a href="#press" className="hover:text-[#FF6B35] transition-colors">Press Kit</a></li>
            </ul>
          </div>

          {/* Security & Legal */}
          <div className="space-y-3 text-xs sm:text-sm">
            <p className="font-bold text-[#111111] uppercase tracking-wider text-xs">Security & Legal</p>
            <ul className="space-y-2 text-[#666666]">
              <li><a href="#privacy" className="hover:text-[#FF6B35] transition-colors">Privacy Policy</a></li>
              <li><a href="#terms" className="hover:text-[#FF6B35] transition-colors">Terms of Service</a></li>
              <li><a href="#security" className="hover:text-[#FF6B35] transition-colors">SOC2 Compliance</a></li>
              <li><a href="#dpa" className="hover:text-[#FF6B35] transition-colors">Data Processing Addendum</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright line */}
        <div className="pt-8 border-t border-[#F0ECE7] flex flex-col sm:flex-row items-center justify-between text-xs text-[#888888] gap-4">
          <p>© {new Date().getFullYear()} Aura AI, Inc. All rights reserved.</p>
          <p className="flex items-center space-x-1">
            <span>Engineered with precision for real-time speech intelligence.</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
