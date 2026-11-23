'use client';

/**
 * shadcn/ui AlertDialog, adapted to the SpendGuard design tokens.
 * Radix provides the focus trap, Escape handling, scroll lock, portal and ARIA wiring.
 */
import * as React from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { useDialogMotion } from '@/components/ui/motion';

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const OpenContext = React.createContext(false);

/**
 * Root. Tracks `open` so the content can animate out before it unmounts (Radix on its own removes
 * it immediately). Always used controlled (open + onOpenChange), as everywhere in the app.
 */
export function AlertDialog({ open, children, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return (
    <OpenContext.Provider value={Boolean(open)}>
      <AlertDialogPrimitive.Root open={open} {...props}>
        {children}
      </AlertDialogPrimitive.Root>
    </OpenContext.Provider>
  );
}
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;

export const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const open = React.useContext(OpenContext);
  const m = useDialogMotion();
  return (
    <AnimatePresence>
      {open && (
        <AlertDialogPrimitive.Portal forceMount>
          <AlertDialogPrimitive.Overlay asChild forceMount>
            <motion.div className="fixed inset-0 z-[60] bg-overlay" {...m.overlay} />
          </AlertDialogPrimitive.Overlay>
          {/* The centring box is separate from the animated panel so Framer's transform never fights a CSS translate */}
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
            <AlertDialogPrimitive.Content asChild forceMount ref={ref} {...props}>
              <motion.div
                data-motion={m.reduce ? 'reduced' : 'animated'}
                className={cn(
                  'pointer-events-auto w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto',
                  'bg-surface border border-line rounded-dialog shadow-2xl p-6 space-y-4 focus:outline-none',
                  className,
                )}
                {...m.panel}
              >
                {children}
              </motion.div>
            </AlertDialogPrimitive.Content>
          </div>
        </AlertDialogPrimitive.Portal>
      )}
    </AnimatePresence>
  );
});
AlertDialogContent.displayName = 'AlertDialogContent';

export const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('space-y-1.5 min-w-0', className)} {...props} />
);

export const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1', className)} {...props} />
);

export const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title ref={ref} className={cn('font-serif text-lg text-fg', className)} {...props} />
));
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName;

export const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    asChild
    className={cn('text-xs text-fg-secondary leading-relaxed space-y-2', className)}
    {...props}
  />
));
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName;

export const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(
      'px-4 py-2 rounded-full border border-line bg-surface text-fg text-xs font-semibold hover:bg-surface-muted disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName;
