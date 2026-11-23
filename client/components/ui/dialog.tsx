'use client';

/**
 * shadcn/ui Dialog (forms and content) on Radix, with the SpendGuard tokens. For a yes/no
 * decision use ConfirmDialog (AlertDialog) instead; this is for dialogs that hold a form.
 * Radix supplies the focus trap, Escape, scroll lock, portal and ARIA wiring.
 */
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Tip } from '@/components/ui/tooltip';
import { useDialogMotion } from '@/components/ui/motion';

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const OpenContext = React.createContext(false);

/** Root. Tracks `open` so the content can animate out before it unmounts. Used controlled. */
export function Dialog({ open, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return (
    <OpenContext.Provider value={Boolean(open)}>
      <DialogPrimitive.Root open={open} {...props}>
        {children}
      </DialogPrimitive.Root>
    </OpenContext.Provider>
  );
}
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }
>(({ className, children, hideClose, ...props }, ref) => {
  const open = React.useContext(OpenContext);
  const m = useDialogMotion();
  return (
    <AnimatePresence>
      {open && (
        <DialogPrimitive.Portal forceMount>
          <DialogPrimitive.Overlay asChild forceMount>
            <motion.div className="fixed inset-0 z-[60] bg-overlay" {...m.overlay} />
          </DialogPrimitive.Overlay>
          {/* The centring box is separate from the animated panel so Framer's transform never fights a CSS translate */}
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
            <DialogPrimitive.Content asChild forceMount ref={ref} {...props}>
              <motion.div
                data-motion={m.reduce ? 'reduced' : 'animated'}
                className={cn(
                  'pointer-events-auto relative w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto',
                  'bg-surface border border-line rounded-dialog shadow-2xl p-6 space-y-4 focus:outline-none',
                  className,
                )}
                {...m.panel}
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
              </motion.div>
            </DialogPrimitive.Content>
          </div>
        </DialogPrimitive.Portal>
      )}
    </AnimatePresence>
  );
});
DialogContent.displayName = 'DialogContent';

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
