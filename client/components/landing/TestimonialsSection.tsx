'use client';

import React from 'react';
import { Star, Quote } from 'lucide-react';

export function TestimonialsSection() {
  const testimonials = [
    {
      quote: "Aura AI fundamentally eliminated the 30 minutes our engineers used to spend writing meeting recaps after every sprint planning. The action item detection is shockingly precise.",
      author: "David Vance",
      role: "VP of Engineering at Orbitly",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80"
    },
    {
      quote: "The real-time translation and sub-180ms latency during our global architectural syncs with our Tokyo team saved our quarter. It feels like magic.",
      author: "Maya Lindqvist",
      role: "Head of Product at NovaLabs",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80"
    },
    {
      quote: "The automatic sync to Jira and Notion directly from conversation speech without intrusive bots is exactly what our compliance team needed.",
      author: "Kareem Hassan",
      role: "Chief Technology Officer at Flowmark",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80"
    }
  ];

  return (
    <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-[#FFF1EA] border border-[#FFD9C7] text-xs font-bold text-[#FF6B35]">
          <span>Customer Stories</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#111111]">
          Loved by builders who <span className="text-orange-gradient">move fast</span>
        </h2>
        <p className="text-base text-[#666666]">
          See how leading product and engineering teams automate meeting intelligence with Aura AI.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
        {testimonials.map((t, idx) => (
          <div
            key={idx}
            className="bg-white rounded-[32px] p-8 border border-[#F0ECE7] saas-container-shadow hover:border-[#FFC7B0] transition-all duration-300 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center space-x-1 text-[#FF6B35] mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-[#FF6B35]" />
                ))}
              </div>

              <p className="text-sm text-[#333333] leading-relaxed italic mb-6">
                "{t.quote}"
              </p>
            </div>

            <div className="flex items-center space-x-3 pt-4 border-t border-[#F5F2EE]">
              <img
                src={t.avatar}
                alt={t.author}
                className="w-11 h-11 rounded-full object-cover border border-[#FFD9C7]"
              />
              <div>
                <p className="text-sm font-bold text-[#111111]">{t.author}</p>
                <p className="text-xs text-[#777777]">{t.role}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
