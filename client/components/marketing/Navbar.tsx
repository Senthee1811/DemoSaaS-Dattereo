'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, Menu, X, ArrowRight } from 'lucide-react';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="w-full pt-4 pb-2 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      <nav className="flex items-center justify-between py-2.5 px-5 bg-white rounded-xl border border-[#E4E4E0] shadow-xs">
        {/* Left: Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-[#FF6B35] flex items-center justify-center text-white shadow-2xs">
            <ShieldCheck className="w-4 h-4 text-white" strokeWidth={2.2} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm tracking-tight text-[#18191B]">SpendGuard</span>
            <span className="text-[10px] uppercase font-bold tracking-wider px-1 py-0.2 rounded bg-[#F3F3F0] text-[#5F6368] border border-[#E4E4E0]">
              AI
            </span>
          </div>
        </Link>

        {/* Center: Navigation Links */}
        <div className="hidden md:flex items-center gap-6 text-xs font-semibold text-[#5F6368]">
          <a href="#how-it-works" className="hover:text-[#18191B] transition-colors">
            Integration
          </a>
          <a href="#demo" className="hover:text-[#18191B] transition-colors">
            Test Bench
          </a>
          <a href="#features" className="hover:text-[#18191B] transition-colors">
            Capabilities
          </a>
          <a href="#pricing" className="hover:text-[#18191B] transition-colors">
            Pricing
          </a>
        </div>

        {/* Right: Login & CTA */}
        <div className="hidden sm:flex items-center gap-2.5">
          <Link
            href="/login"
            className="text-xs font-semibold text-[#5F6368] hover:text-[#18191B] px-3 py-1.5 transition-colors"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white px-3.5 py-1.5 rounded-md bg-[#FF6B35] hover:bg-[#E85520] shadow-xs transition-colors"
          >
            <span>Start Free</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <div className="flex md:hidden items-center">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 text-[#5F6368] hover:text-[#18191B]"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-2 p-4 bg-white rounded-xl border border-[#E4E4E0] shadow-md flex flex-col gap-3 text-xs">
          <a
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="font-medium text-[#5F6368] hover:text-[#18191B] py-1"
          >
            Integration
          </a>
          <a
            href="#demo"
            onClick={() => setMobileMenuOpen(false)}
            className="font-medium text-[#5F6368] hover:text-[#18191B] py-1"
          >
            Test Bench
          </a>
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="font-medium text-[#5F6368] hover:text-[#18191B] py-1"
          >
            Capabilities
          </a>
          <a
            href="#pricing"
            onClick={() => setMobileMenuOpen(false)}
            className="font-medium text-[#5F6368] hover:text-[#18191B] py-1"
          >
            Pricing
          </a>
          <div className="pt-2 border-t border-[#E4E4E0] flex flex-col gap-2">
            <Link
              href="/login"
              className="w-full text-center py-2 rounded-md bg-[#F3F3F0] font-semibold text-[#18191B]"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="w-full text-center py-2 rounded-md bg-[#FF6B35] font-semibold text-white shadow-xs"
            >
              Start Free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
