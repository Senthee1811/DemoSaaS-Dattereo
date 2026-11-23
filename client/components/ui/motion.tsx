'use client';

/**
 * Motion for SpendGuard (Framer Motion), in one place.
 *
 * The rule: when the user prefers reduced motion, nothing animates. Reveals and page transitions
 * render plain elements (no initial hidden state, no transform, no opacity change), and dialogs
 * mount and unmount instantly. It is an instant state change, not a faster animation.
 * `data-motion` is "animated" or "reduced" on each wrapper so this is checkable.
 */
import React from 'react';
import { MotionConfig, motion, useReducedMotion, type TargetAndTransition, type Transition } from 'framer-motion';

/** Same curve as --ease-standard in globals.css. */
export const EASE = [0.2, 0, 0, 1] as const;

/** Wrap the app once: also makes any other Framer transform animation honour the OS setting. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Fades and lifts its content in as it scrolls into view (once). */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  /** Seconds. Use small steps (0.05) to stagger a row of cards. */
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <div className={className} data-motion="reduced">
        {children}
      </div>
    );
  }
  return (
    <motion.div
      className={className}
      data-motion="animated"
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -40px 0px' }}
      transition={{ duration: 0.35, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Eases the dashboard's content in when the section changes (keyed by the section). */
export function PageTransition({ tabKey, children }: { tabKey: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <div key={tabKey} data-motion="reduced">
        {children}
      </div>
    );
  }
  return (
    <motion.div
      key={tabKey}
      data-motion="animated"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

interface DialogMotion {
  reduce: boolean;
  overlay: { initial?: TargetAndTransition | false; animate?: TargetAndTransition; exit?: TargetAndTransition; transition?: Transition };
  panel: { initial?: TargetAndTransition | false; animate?: TargetAndTransition; exit?: TargetAndTransition; transition?: Transition };
}

/** Enter/exit for dialogs. Reduced motion: no initial state, no exit, so open/close is instant. */
export function useDialogMotion(): DialogMotion {
  const reduce = Boolean(useReducedMotion());
  if (reduce) return { reduce, overlay: { initial: false }, panel: { initial: false } };
  return {
    reduce,
    overlay: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15, ease: EASE } },
    panel: {
      initial: { opacity: 0, scale: 0.97, y: 8 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.98, y: 4 },
      transition: { duration: 0.18, ease: EASE },
    },
  };
}
