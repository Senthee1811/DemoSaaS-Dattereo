'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Shield, ChevronRight, Menu, X, ArrowRight, Gauge, Lock } from 'lucide-react';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="w-full pt-4 pb-2 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      <nav className="flex items-center justify-between py-3 px-5 sm:px-7 bg-white/90 backdrop-blur-md rounded-full border border-[#E8E8E8] shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        {/* Left: Logo & Wordmark */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FF6B35] to-[#FF8A4C] flex items-center justify-center text-white shadow-[0_4px_12px_rgba(255,107,53,0.3)] transition-transform group-hover:scale-105">
            <Shield className="w-5 h-5 text-white" strokeWidth={2.2} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-[17px] tracking-tight text-[#111111] flex items-center gap-1.5">
              SpendGuard
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#FFF1EA] text-[#FF6B35] border border-[#FFD9C7]">
                AI
              </span>
            </span>
          </div>
        </Link>

        {/* Center: Navigation Links */}
        <div className="hidden md:flex items-center gap-8 text-[14.5px] font-medium text-[#666666]">
          <a href="#how-it-works" className="hover:text-[#111111] transition-colors">
            How it works
          </a>
          <a href="#use-cases" className="hover:text-[#111111] transition-colors">
            Use Cases
          </a>
          <a href="#features" className="hover:text-[#111111] transition-colors">
            Features
          </a>
          <a href="#pricing" className="hover:text-[#111111] transition-colors">
            Pricing
          </a>
          <a href="#faq" className="hover:text-[#111111] transition-colors">
            FAQ
          </a>
        </div>

        {/* Right: Login & CTA */}
        <div className="hidden sm:flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-[14.5px] font-medium text-[#444444] hover:text-[#111111] px-3.5 py-2 transition-colors"
          >
            Log in
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-white px-5 py-2.5 rounded-full bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] shadow-[0_4px_14px_rgba(255,107,53,0.35)] hover:shadow-[0_6px_20px_rgba(255,107,53,0.45)] hover:-translate-y-0.5 active:translate-y-0 transition-all"
          >
            <span>Get Started</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <div className="flex md:hidden items-center">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-[#444444] hover:text-[#111111] focus:outline-none"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-2 p-5 bg-white rounded-3xl border border-[#E8E8E8] shadow-xl flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <a
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="text-base font-medium text-[#444444] hover:text-[#FF6B35] py-1"
          >
            How it works
          </a>
          <a
            href="#use-cases"
            onClick={() => setMobileMenuOpen(false)}
            className="text-base font-medium text-[#444444] hover:text-[#FF6B35] py-1"
          >
            Use Cases
          </a>
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="text-base font-medium text-[#444444] hover:text-[#FF6B35] py-1"
          >
            Features
          </a>
          <a
            href="#pricing"
            onClick={() => setMobileMenuOpen(false)}
            className="text-base font-medium text-[#444444] hover:text-[#FF6B35] py-1"
          >
            Pricing
          </a>
          <a
            href="#faq"
            onClick={() => setMobileMenuOpen(false)}
            className="text-base font-medium text-[#444444] hover:text-[#FF6B35] py-1"
          >
            FAQ
          </a>
          <div className="pt-3 border-t border-[#E8E8E8] flex flex-col gap-2">
            <Link
              href="/dashboard"
              className="w-full text-center text-sm font-medium text-[#444444] py-2 rounded-xl bg-[#F6F6F6]"
            >
              Log in
            </Link>
            <Link
              href="/dashboard"
              className="w-full text-center text-sm font-semibold text-white py-2.5 rounded-full bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] shadow-md"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
