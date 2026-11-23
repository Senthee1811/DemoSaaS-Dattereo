'use client';

/**
 * The one feedback system for the app.
 * - Toasts (useToast): non-blocking results — saved, key generated, job finished, request failed.
 * - ConfirmDialog: any decision — sensitive (Type C) or destructive (Type D) actions.
 *   It stays open while the action runs, shows the real error on failure, and closes only on
 *   success or an explicit cancel. Never use window.alert/confirm, and never replace a needed
 *   confirmation with a toast.
 * - Spinner: inline and button loading indicator.
 */
import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CircleCheck, CircleX, TriangleAlert, Info, X, Loader2, ShieldAlert } from 'lucide-react';

export type FeedbackVariant = 'success' | 'error' | 'warning' | 'info' | 'confirmation';

const VARIANT_STYLE: Record<FeedbackVariant, { icon: React.ElementType; tone: string; box: string }> = {
  success: { icon: CircleCheck, tone: 'text-success', box: 'border-success-border bg-success-bg' },
  error: { icon: CircleX, tone: 'text-critical', box: 'border-critical-border bg-critical-bg' },
  warning: { icon: TriangleAlert, tone: 'text-warning', box: 'border-warning-border bg-warning-bg' },
  info: { icon: Info, tone: 'text-info', box: 'border-info-border bg-info-bg' },
  confirmation: { icon: ShieldAlert, tone: 'text-accent', box: 'border-accent-border bg-accent-subtle' },
};

/* ── Spinner ──────────────────────────────────────────────────────────────── */

export function Spinner({ className = 'w-3.5 h-3.5', label }: { className?: string; label?: string }) {
  return (
    <Loader2
      className={`animate-spin shrink-0 ${className}`}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'status' : undefined}
    />
  );
}

/* ── Inline alert (in-page message, same five variants) ──────────────────── */

export function InlineAlert({
  variant,
  title,
  children,
  className = '',
}: {
  variant: FeedbackVariant;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, tone, box } = VARIANT_STYLE[variant];
  return (
    <div
      role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 p-3 rounded-field border text-xs ${box} ${className}`}
    >
      <Icon className={`w-4 h-4 mt-px ${tone}`} aria-hidden />
      <div className="space-y-0.5 text-fg">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-fg-secondary">{children}</div>}
      </div>
    </div>
  );
}

/* ── Toasts ───────────────────────────────────────────────────────────────── */

interface Toast {
  id: number;
  variant: Exclude<FeedbackVariant, 'confirmation'>;
  title: string;
  description?: string;
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TOAST_MS = { success: 4000, info: 5000, warning: 7000, error: 8000 } as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (variant: Toast['variant'], title: string, description?: string) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-3), { id, variant, title, description }]);
      setTimeout(() => dismiss(id), TOAST_MS[variant]);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, d) => push('success', t, d),
      error: (t, d) => push('error', t, d),
      warning: (t, d) => push('warning', t, d),
      info: (t, d) => push('info', t, d),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Polite live region: announced without stealing focus */}
      <div aria-live="polite" aria-relevant="additions" className="fixed bottom-4 right-4 left-4 sm:left-auto z-[70] flex flex-col gap-2 sm:w-96 pointer-events-none">
        {toasts.map((t) => {
          const { icon: Icon, tone } = VARIANT_STYLE[t.variant];
          return (
            <div
              key={t.id}
              role={t.variant === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex items-start gap-2.5 p-3.5 rounded-menu border border-line bg-surface shadow-lg text-xs"
            >
              <Icon className={`w-4 h-4 mt-px ${tone}`} aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-fg">{t.title}</p>
                {t.description && <p className="text-fg-secondary mt-0.5 break-words">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="p-0.5 rounded-control text-fg-muted hover:text-fg"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** Toast API. Outside a provider it degrades to console output instead of crashing. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  const log = (title: string, description?: string) => console.info(title, description ?? '');
  return { success: log, error: log, warning: log, info: log };
}

/* ── Confirmation dialog (Types C and D) ─────────────────────────────────── */

export interface ConfirmDialogProps {
  open: boolean;
  /** 'danger' for destructive (Type D), 'sensitive' for Type C, 'default' for anything else. */
  tone?: 'danger' | 'sensitive' | 'default';
  title: string;
  /** What happens, in plain words. */
  description: React.ReactNode;
  /** Specific consequences, e.g. "Anything still using this key gets 401 immediately." */
  consequences?: string[];
  /** Whether it can be undone. Only state what the backend actually guarantees. */
  reversible?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** When set, the user must type this exact text before the confirm button enables. */
  requireText?: string;
  /** Runs the action. Throw (or reject) to keep the dialog open and show the message. */
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  tone = 'default',
  title,
  description,
  consequences,
  reversible,
  confirmLabel,
  cancelLabel = 'Cancel',
  requireText,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    if (busy) return; // never abandon a request that is still running
    setError(null);
    setTyped('');
    onClose();
  }, [busy, onClose]);

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    // Destructive dialogs focus Cancel, so Enter never confirms by accident
    cancelRef.current?.focus();
    return () => restoreFocus.current?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      } else if (e.key === 'Tab' && panelRef.current) {
        // Keep focus inside the dialog
        const nodes = panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href]');
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  if (!open) return null;

  const confirmEnabled = !busy && (!requireText || typed.trim() === requireText);

  const run = async () => {
    if (!confirmEnabled) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setBusy(false);
      setTyped('');
      onClose(); // success only
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error && err.message ? err.message : 'The action failed. Please try again.');
    }
  };

  const confirmClass =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : tone === 'sensitive'
        ? 'bg-accent hover:bg-accent-hover text-white'
        : 'bg-code hover:opacity-90 text-white';
  const iconTone = tone === 'danger' ? 'text-critical bg-critical-bg' : tone === 'sensitive' ? 'text-warning bg-warning-bg' : 'text-info bg-info-bg';
  const Icon = tone === 'default' ? Info : TriangleAlert;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay" onClick={close} aria-hidden />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative w-full max-w-md bg-surface border border-line rounded-dialog shadow-2xl p-6 space-y-4"
      >
        <div className="flex items-start gap-3">
          <span className={`p-2 rounded-full ${iconTone}`}>
            <Icon className="w-4 h-4" aria-hidden />
          </span>
          <div className="space-y-1.5 min-w-0">
            <h2 id={titleId} className="font-serif text-lg text-fg">{title}</h2>
            <div id={descId} className="text-xs text-fg-secondary leading-relaxed space-y-2">
              <div>{description}</div>
              {consequences && consequences.length > 0 && (
                <ul className="list-disc pl-4 space-y-1">
                  {consequences.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
              {reversible && <p className="font-semibold text-fg">{reversible}</p>}
            </div>
          </div>
        </div>

        {requireText && (
          <label className="block text-xs text-fg-secondary space-y-1.5">
            <span>
              Type <code className="px-1.5 py-0.5 rounded-control bg-surface-muted text-fg font-mono">{requireText}</code> to confirm
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              className="w-full px-3 py-2 rounded-field border border-line bg-surface text-fg font-mono text-xs focus:border-accent focus:outline-none"
            />
          </label>
        )}

        {error && (
          <InlineAlert variant="error" title="That didn't work">
            {error}
          </InlineAlert>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={close}
            disabled={busy}
            className="px-4 py-2 rounded-full border border-line bg-surface text-fg text-xs font-semibold hover:bg-surface-muted disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={run}
            disabled={!confirmEnabled}
            aria-busy={busy}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-xs font-semibold disabled:opacity-50 ${confirmClass}`}
          >
            {busy && <Spinner />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
