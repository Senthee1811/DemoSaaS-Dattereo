import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { clearApiCache } from '@/lib/api-cache';

// The API cache is module state: never let one test's responses leak into the next
afterEach(() => {
  cleanup();
  clearApiCache();
});

// jsdom has no matchMedia (used by the theme hook). Default: light, no listeners fire.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// Radix (Select, Dialog) needs a few layout/pointer APIs that jsdom does not implement.
if (typeof window !== 'undefined') {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  (globalThis as unknown as Record<string, unknown>).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Framer Motion: finish animations immediately in tests, and treat everything as in view so scroll reveals fire.
import { MotionGlobalConfig } from 'framer-motion';
MotionGlobalConfig.skipAnimations = true;
if (typeof window !== 'undefined' && !('IntersectionObserver' in window)) {
  (window as unknown as Record<string, unknown>).IntersectionObserver = class {
    private cb: IntersectionObserverCallback;
    constructor(cb: IntersectionObserverCallback) {
      this.cb = cb;
    }
    observe(el: Element) {
      this.cb([{ isIntersecting: true, target: el, intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
}
