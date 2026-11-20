'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, ArrowRight } from 'lucide-react';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full pt-4 pb-2 px-4 sm:px-6 lg:px-8 max-w-310 mx-auto">
      <nav className="flex items-center justify-between py-2.5 px-6 bg-[#FFFFFF]/90 backdrop-blur-md rounded-full border border-parchment-border shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        {/* Left: Brand Identity */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <Image
            src="/logo-wordmark.png"
            alt="SpendGuard AI by Dattereo"
            width={2063}
            height={644}
            className="h-10 w-auto"
            priority
          />
        </Link>

        {/* Center: Navigation Links */}
        <div className="hidden md:flex items-center gap-7 text-xs font-medium text-[#555550]">
          <a href="#demo" className="hover:text-sg-text-primary transition-colors">
            Interactive Gateway
          </a>
          <a href="#how-it-works" className="hover:text-sg-text-primary transition-colors">
            Integration
          </a>
          <a href="#features" className="hover:text-sg-text-primary transition-colors">
            FinOps Engine
          </a>
          <a href="#pricing" className="hover:text-sg-text-primary transition-colors">
            Pricing
          </a>
          <a href="#faq" className="hover:text-sg-text-primary transition-colors">
            Architecture
          </a>
        </div>

        {/* Right: Login & Pill CTA */}
        <div className="hidden sm:flex items-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white px-4 py-2 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] transition-colors shadow-2xs"
          >
            <span>Sign In</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <div className="flex md:hidden items-center">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 text-[#555550] hover:text-sg-text-primary"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-2 p-5 bg-white rounded-2xl border border-parchment-border shadow-lg flex flex-col gap-3.5 text-xs">
          <a
            href="#demo"
            onClick={() => setMobileMenuOpen(false)}
            className="font-medium text-[#555550] hover:text-sg-text-primary py-1"
          >
            Interactive Gateway
          </a>
          <a
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="font-medium text-[#555550] hover:text-sg-text-primary py-1"
          >
            Integration
          </a>
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="font-medium text-[#555550] hover:text-sg-text-primary py-1"
          >
            FinOps Engine
          </a>
          <a
            href="#pricing"
            onClick={() => setMobileMenuOpen(false)}
            className="font-medium text-[#555550] hover:text-sg-text-primary py-1"
          >
            Pricing
          </a>
          <a
            href="#faq"
            onClick={() => setMobileMenuOpen(false)}
            className="font-medium text-[#555550] hover:text-sg-text-primary py-1"
          >
            Architecture
          </a>
          <div className="pt-3 border-t border-parchment-border flex flex-col gap-2">
            <Link
              href="/login"
              className="text-center py-2.5 rounded-full bg-[#FF6B35] text-white text-xs font-semibold"
            >
              Sign In
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
