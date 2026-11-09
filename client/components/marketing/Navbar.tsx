'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, Menu, X, ArrowRight } from 'lucide-react';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full pt-4 pb-2 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      <nav className="flex items-center justify-between py-2.5 px-6 bg-[#FFFFFF]/90 backdrop-blur-md rounded-full border border-[#E5E0D8] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        {/* Left: Brand Identity */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-full bg-[#FF6B35] flex items-center justify-center text-white">
            <ShieldCheck className="w-4 h-4 text-white" strokeWidth={2.2} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold text-sm tracking-tight text-[#18191B]">SpendGuard</span>
            <span className="text-[10px] font-mono text-[#80868B] tracking-normal">by Dattreo</span>
          </div>
        </Link>

        {/* Center: Navigation Links */}
        <div className="hidden md:flex items-center gap-7 text-xs font-medium text-[#555550]">
          <a href="#demo" className="hover:text-[#18191B] transition-colors">
            Interactive Gateway
          </a>
          <a href="#how-it-works" className="hover:text-[#18191B] transition-colors">
            Integration
          </a>
          <a href="#features" className="hover:text-[#18191B] transition-colors">
            FinOps Engine
          </a>
          <a href="#pricing" className="hover:text-[#18191B] transition-colors">
            Pricing
          </a>
          <a href="#faq" className="hover:text-[#18191B] transition-colors">
            Architecture
          </a>
        </div>

        {/* Right: Login & Pill CTA */}
        <div className="hidden sm:flex items-center gap-3">
          <Link
            href="/login"
            className="text-xs font-medium text-[#555550] hover:text-[#18191B] px-3 py-1.5 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white px-4 py-2 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] transition-colors shadow-2xs"
          >
            <span>Start Free Trial</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <div className="flex md:hidden items-center">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 text-[#555550] hover:text-[#18191B]"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-2 p-5 bg-white rounded-2xl border border-[#E5E0D8] shadow-lg flex flex-col gap-3.5 text-xs">
          <a
            href="#demo"
            onClick={() => setMobileMenuOpen(false)}
            className="font-medium text-[#555550] hover:text-[#18191B] py-1"
          >
            Interactive Gateway
          </a>
          <a
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="font-medium text-[#555550] hover:text-[#18191B] py-1"
          >
            Integration
          </a>
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="font-medium text-[#555550] hover:text-[#18191B] py-1"
          >
            FinOps Engine
          </a>
          <a
            href="#pricing"
            onClick={() => setMobileMenuOpen(false)}
            className="font-medium text-[#555550] hover:text-[#18191B] py-1"
          >
            Pricing
          </a>
          <a
            href="#faq"
            onClick={() => setMobileMenuOpen(false)}
            className="font-medium text-[#555550] hover:text-[#18191B] py-1"
          >
            Architecture
          </a>
          <div className="pt-3 border-t border-[#E5E0D8] flex flex-col gap-2">
            <Link
              href="/login"
              className="text-center py-2 text-xs font-medium text-[#555550] hover:text-[#18191B]"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="text-center py-2.5 rounded-full bg-[#FF6B35] text-white text-xs font-semibold"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
