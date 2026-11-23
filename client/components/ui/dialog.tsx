'use client';

/**
 * shadcn/ui Dialog (forms and content) on Radix, with the SpendGuard tokens. For a yes/no
 * decision use ConfirmDialog (AlertDialog) instead; this is for dialogs that hold a form.
 * Radix supplies the focus trap, Escape, scroll lock, portal and ARIA wiring.
 */
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Tip } from '@/components/ui/tooltip';

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }
>(({ className, children, hideClose, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-overlay" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2',
        'max-h-[calc(100vh-2rem)] overflow-y-auto bg-surface border border-line rounded-dialog shadow-2xl p-6 space-y-4 focus:outline-none',
        className,
      )}
      {...props}
    >
      {children}
      {!hideClose && (
        <Tip label="Close">
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-4 top-4 p-1.5 rounded-full text-fg-muted hover:text-fg hover:bg-surface-muted"
          >
            <X className="w-4 h-4" />
          </DialogPrimitive.Close>
        </Tip>
      )}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('space-y-1.5 pr-8', className)} {...props} />
);

export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1', className)} {...props} />
);

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('font-serif text-lg text-fg', className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-xs text-fg-secondary leading-relaxed', className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
