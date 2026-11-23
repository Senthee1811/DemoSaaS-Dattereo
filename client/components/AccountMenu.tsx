'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, UserRound, Settings2, ShieldCheck, LogOut, Sun, Moon, Monitor, Check } from 'lucide-react';
import { signOut } from '@/lib/auth-fetch';
import { useTheme, type ThemePreference } from '@/lib/theme';
import { ConfirmDialog } from '@/components/ui/feedback';
import type { SettingsTab } from '@/components/settings/SettingsView';

interface AccountMenuProps {
  name: string;
  roleLabel: string;
  initials: string;
  email?: string;
  onOpenSettings: (section: SettingsTab) => void;
}

const THEMES: Array<{ id: ThemePreference; label: string; icon: React.ElementType }> = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

export function AccountMenu({ name, roleLabel, initials, email, onOpenSettings }: AccountMenuProps) {
  const router = useRouter();
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  // Focus the first item when the menu opens
  useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open]);

  // Outside click closes without stealing focus back
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !buttonRef.current?.contains(t)) close(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open, close]);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  const choose = (action: () => void) => {
    close();
    action();
  };

  const itemClass =
    'w-full flex items-center gap-2.5 px-3 py-2 rounded-control text-xs text-fg hover:bg-surface-muted focus:bg-surface-muted focus:outline-none text-left';

  return (
    <div className="relative pl-3 border-l border-line">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex items-center gap-2.5 p-1 pr-2 rounded-full hover:bg-surface-muted"
      >
        <span className="w-8 h-8 rounded-full bg-surface-subtle border border-line flex items-center justify-center text-xs font-semibold text-fg">
          {initials}
        </span>
        <span className="hidden sm:block text-left text-xs">
          <span className="block font-semibold text-fg leading-none">{name}</span>
          <span className="block text-caption text-fg-secondary leading-none mt-1">{roleLabel}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        <span className="sr-only">Account menu</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full mt-2 z-40 w-64 max-w-[calc(100vw-2rem)] p-1.5 rounded-menu border border-line bg-surface shadow-xl"
        >
          <div className="px-3 py-2 border-b border-line mb-1">
            <p className="text-xs font-semibold text-fg truncate">{name}</p>
            {email && <p className="text-caption text-fg-muted truncate">{email}</p>}
          </div>

          <button type="button" role="menuitem" tabIndex={-1} className={itemClass} onClick={() => choose(() => onOpenSettings('profile'))}>
            <UserRound className="w-4 h-4 text-fg-muted" aria-hidden />
            Profile
          </button>
          <button type="button" role="menuitem" tabIndex={-1} className={itemClass} onClick={() => choose(() => onOpenSettings('account'))}>
            <Settings2 className="w-4 h-4 text-fg-muted" aria-hidden />
            Account settings
          </button>
          <button type="button" role="menuitem" tabIndex={-1} className={itemClass} onClick={() => choose(() => onOpenSettings('security'))}>
            <ShieldCheck className="w-4 h-4 text-fg-muted" aria-hidden />
            Security
          </button>

          <div role="group" aria-label="Theme" className="border-t border-line mt-1 pt-1">
            <p className="px-3 pt-1.5 pb-1 text-micro font-mono font-semibold uppercase tracking-wider text-fg-muted">Theme</p>
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="menuitemradio"
                aria-checked={preference === t.id}
                tabIndex={-1}
                className={itemClass}
                onClick={() => choose(() => setPreference(t.id))}
              >
                <t.icon className="w-4 h-4 text-fg-muted" aria-hidden />
                <span className="flex-1">{t.label}</span>
                {preference === t.id && <Check className="w-3.5 h-3.5 text-accent" aria-hidden />}
              </button>
            ))}
          </div>

          <div className="border-t border-line mt-1 pt-1">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`${itemClass} text-critical`}
              onClick={() => choose(() => setConfirmSignOut(true))}
            >
              <LogOut className="w-4 h-4" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out of SpendGuard?"
        description="This ends your session on this device. Your session is revoked on the server, so it cannot be resumed without signing in again."
        confirmLabel="Sign out"
        onConfirm={async () => {
          await signOut(); // throws (dialog stays open with the error) if the server did not revoke
          router.replace('/login?signedOut=1');
        }}
        onClose={() => setConfirmSignOut(false)}
      />
    </div>
  );
}
