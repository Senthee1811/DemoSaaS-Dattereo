'use client';

/**
 * shadcn/ui Tooltip on Radix, with the SpendGuard tokens. `Tip` is the one wrapper for icon-only
 * controls: it names what the control does on hover AND on keyboard focus (Radix handles both), so
 * the name is never hover-only. It carries its own provider so it works anywhere, with no app-wide
 * setup to forget.
 */
import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className = '', sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={`z-[80] max-w-xs rounded-control bg-code px-2.5 py-1.5 text-label font-medium text-code-fg shadow-lg ${className}`}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/**
 * Wrap an icon-only control: `<Tip label="Notifications"><button aria-label="Notifications">…</button></Tip>`.
 * The child must be a single element that accepts a ref (a button or link).
 */
export function Tip({
  label,
  children,
  side = 'bottom',
  delayDuration = 250,
}: {
  label: string;
  children: React.ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delayDuration?: number;
}) {
  return (
    <TooltipProvider delayDuration={delayDuration} skipDelayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
