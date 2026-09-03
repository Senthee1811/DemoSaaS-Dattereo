'use client';

import React from 'react';
import { ArrowRight, Sparkles, Hexagon, CircleDot, Compass, Cpu, Orbit } from 'lucide-react';

export function LogoStrip() {
  return (
    <div className="w-full mt-10 pt-8 border-t border-[#F0ECE7]">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 text-center mb-6 px-2">
        <span className="text-[13px] sm:text-[14px] text-[#555555] font-medium flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#FF6B35]" />
          Get governance-grade AI cost control with our early-access offer
        </span>
        <a
          href="#pricing"
          className="inline-flex items-center gap-1 text-[13px] sm:text-[14px] font-semibold text-[#FF6B35] hover:text-[#E0531F] group transition-colors"
        >
          <span>Claim 3 months free</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </a>
      </div>

      {/* Monochrome Logos */}
      <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 lg:gap-16 opacity-75 hover:opacity-95 transition-opacity">
        {/* Orbitly */}
        <div className="flex items-center gap-2 text-[#222222]">
          <Orbit className="w-5 h-5 text-[#222222]" />
          <span className="font-black tracking-tight text-[15.5px]">ORBITLY</span>
        </div>

        {/* NovaLabs */}
        <div className="flex items-center gap-2 text-[#222222]">
          <Hexagon className="w-5 h-5 text-[#222222]" />
          <span className="font-black tracking-tight text-[15.5px]">NOVALABS</span>
        </div>

        {/* Flowmark */}
        <div className="flex items-center gap-2 text-[#222222]">
          <CircleDot className="w-5 h-5 text-[#222222]" />
          <span className="font-black tracking-tight text-[15.5px]">FLOWMARK</span>
        </div>

        {/* Syntra */}
        <div className="flex items-center gap-2 text-[#222222]">
          <Cpu className="w-5 h-5 text-[#222222]" />
          <span className="font-black tracking-tight text-[15.5px]">SYNTRA</span>
        </div>

        {/* Northstar */}
        <div className="flex items-center gap-2 text-[#222222]">
          <Compass className="w-5 h-5 text-[#222222]" />
          <span className="font-black tracking-tight text-[15.5px]">NORTHSTAR</span>
        </div>
      </div>
    </div>
  );
}
