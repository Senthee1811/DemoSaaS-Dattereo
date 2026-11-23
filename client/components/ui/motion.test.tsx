/** 10.3: with motion allowed, content really animates (hidden until it scrolls into view). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { PageTransition, Reveal } from './motion';
import { ConfirmDialog } from './feedback';

const realIO = window.IntersectionObserver;
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = false; // test the real initial state, not the instant test mode
  // Never reports "in view", so a Reveal stays in its starting state
  (window as unknown as Record<string, unknown>).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  (window as unknown as Record<string, unknown>).IntersectionObserver = realIO;
});

describe('motion allowed (default)', () => {
  it('a Reveal starts hidden and offset until it scrolls into view', () => {
    render(<Reveal>content</Reveal>);
    const el = screen.getByText('content');
    expect(el.getAttribute('data-motion')).toBe('animated');
    expect(el.style.opacity).toBe('0');
    expect(el.style.transform).toContain('translateY(12px)');
  });

  it('a page transition is animated', () => {
    render(<PageTransition tabKey="overview">page</PageTransition>);
    expect(screen.getByText('page').getAttribute('data-motion')).toBe('animated');
  });

  it('a dialog panel is animated and starts transparent', () => {
    render(<ConfirmDialog open title="T" description="D" confirmLabel="Go" onConfirm={() => {}} onClose={() => {}} />);
    const panel = screen.getByRole('alertdialog');
    expect(panel.getAttribute('data-motion')).toBe('animated');
    expect(panel.style.opacity).toBe('0');
  });
});
