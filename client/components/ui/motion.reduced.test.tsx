/**
 * 10.3: with prefers-reduced-motion set, nothing animates. Not a shorter animation: no initial
 * hidden state, no transform, no opacity change, and dialogs open and close instantly.
 * (Separate file: Framer caches the OS preference once per module instance.)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MotionGlobalConfig } from 'framer-motion';
import { PageTransition, Reveal } from './motion';
import { ConfirmDialog } from './feedback';

const realMatchMedia = window.matchMedia;
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = false; // so a real animation WOULD run if it were not suppressed
  window.matchMedia = ((query: string) => ({
    matches: /prefers-reduced-motion/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  window.matchMedia = realMatchMedia;
});

describe('prefers-reduced-motion: reduce', () => {
  it('a Reveal is plain content: visible at once, no inline opacity or transform', () => {
    render(<Reveal>content</Reveal>);
    const el = screen.getByText('content');
    expect(el.getAttribute('data-motion')).toBe('reduced');
    expect(el.getAttribute('style') ?? '').not.toMatch(/opacity|transform/);
  });

  it('a page transition does not animate', () => {
    render(<PageTransition tabKey="overview">page</PageTransition>);
    const el = screen.getByText('page');
    expect(el.getAttribute('data-motion')).toBe('reduced');
    expect(el.getAttribute('style') ?? '').not.toMatch(/opacity|transform/);
  });

  it('a dialog appears fully formed and disappears at once (no exit animation to wait for)', async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return <ConfirmDialog open={open} title="T" description="D" confirmLabel="Go" onConfirm={() => {}} onClose={() => setOpen(false)} />;
    }
    render(<Harness />);
    const panel = screen.getByRole('alertdialog');
    expect(panel.getAttribute('data-motion')).toBe('reduced');
    expect(panel.getAttribute('style') ?? '').not.toMatch(/opacity|transform/);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(screen.queryByRole('alertdialog')).toBeNull(); // gone immediately
  });
});
