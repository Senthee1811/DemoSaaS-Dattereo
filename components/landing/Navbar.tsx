'use client';

import React, { useState } from 'react';
import { Sparkles, ArrowRight, Menu, X, User, ChevronDown } from 'lucide-react';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="w-full pt-4 px-4 sm:px-6">
      <div className="max-w-[1240px] mx-auto flex items-center justify-between py-4 px-6 sm:px-8 bg-white/80 backdrop-blur-md rounded-2xl border border-[#F0ECE7] shadow-sm">
        {/* Left: Product Logo & Brand */}
        <div className="flex items-center space-x-3">
          <a href="#" className="flex items-center space-x-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FF6B35] via-[#FF8A4C] to-[#FF9E68] flex items-center justify-center shadow-md shadow-[#FF6B35]/20 group-hover:scale-105 transition-transform duration-200">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-baseline space-x-1">
              <span className="text-xl font-extrabold text-[#111111] tracking-tight">Aura</span>
              <span className="text-xl font-extrabold text-[#FF6B35] tracking-tight">AI</span>
            </div>
          </a>
        </div>

        {/* Center: Navigation Links (Desktop) */}
        <nav className="hidden md:flex items-center space-x-8 text-[14.5px] font-medium text-[#555555]">
          <a
            href="#how-it-works"
            className="hover:text-[#FF6B35] transition-colors duration-150"
          >
            How it works
          </a>
          <a
            href="#use-cases"
            className="hover:text-[#FF6B35] transition-colors duration-150"
          >
            Use cases
          </a>
          <a
            href="#features"
            className="hover:text-[#FF6B35] transition-colors duration-150"
          >
            Features
          </a>
          <a
            href="#pricing"
            className="hover:text-[#FF6B35] transition-colors duration-150"
          >
            Pricing
          </a>
          <a
            href="#faq"
            className="hover:text-[#FF6B35] transition-colors duration-150"
          >
            FAQ
          </a>
        </nav>

        {/* Right: Actions */}
        <div className="hidden sm:flex items-center space-x-3">
          <a
            href="/dashboard"
            className="px-4 py-2 text-[14.5px] font-semibold text-[#333333] hover:text-[#FF6B35] hover:bg-[#FFF8F5] rounded-xl transition-all duration-150"
          >
            Live App Demo
          </a>
          <a
            href="/dashboard"
            className="inline-flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] hover:from-[#F55D25] hover:to-[#FF7B38] text-white text-[14.5px] font-semibold rounded-full shadow-md shadow-[#FF6B35]/25 hover:shadow-lg hover:shadow-[#FF6B35]/35 hover:-translate-y-0.5 transition-all duration-200"
          >
            <span>Start for free</span>
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-xl text-[#333333] hover:bg-[#FFF8F5] transition-colors"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden max-w-[1240px] mx-auto mt-2 bg-white rounded-2xl border border-[#F0ECE7] p-5 shadow-xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <nav className="flex flex-col space-y-3 text-base font-medium text-[#444444]">
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-[#FFF8F5] hover:text-[#FF6B35]"
            >
              How it works
            </a>
            <a
              href="#use-cases"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-[#FFF8F5] hover:text-[#FF6B35]"
            >
              Use cases
            </a>
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-[#FFF8F5] hover:text-[#FF6B35]"
            >
              Features
            </a>
            <a
              href="#pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-[#FFF8F5] hover:text-[#FF6B35]"
            >
              Pricing
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-[#FFF8F5] hover:text-[#FF6B35]"
            >
              FAQ
            </a>
          </nav>
          <div className="pt-3 border-t border-[#F0ECE7] flex flex-col space-y-2">
            <a
              href="#login"
              className="w-full text-center py-2.5 font-semibold text-[#333333] hover:bg-[#FFF8F5] rounded-xl"
            >
              Login
            </a>
            <a
              href="#signup"
              className="w-full text-center py-3 bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] text-white font-semibold rounded-full shadow-md shadow-[#FF6B35]/25"
            >
              Start for free →
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
