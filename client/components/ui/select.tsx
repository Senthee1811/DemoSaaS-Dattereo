'use client';

/**
 * shadcn/ui Select, adapted to the SpendGuard design tokens. Radix provides the listbox
 * semantics, keyboard navigation (arrows, Home/End, typeahead), Escape, focus return, portal
 * and collision-aware positioning. The viewport is capped to the available screen height and
 * scrolls, so the list stays usable however many options it has.
 */
import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex w-full items-center justify-between gap-2 rounded-field border border-line bg-surface px-3.5 py-2.5 text-xs text-fg',
      'focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-fg-muted',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="w-4 h-4 text-fg-muted shrink-0" aria-hidden />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      sideOffset={6}
      className={cn(
        'relative z-[70] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-menu border border-line bg-surface text-fg shadow-xl',
        // Never taller than the space the browser has left; the viewport below scrolls
        'max-h-[var(--radix-select-content-available-height)]',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1.5 max-h-[var(--radix-select-content-available-height)] overflow-y-auto">
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-control py-2 pl-3 pr-8 text-xs outline-none',
      'focus:bg-surface-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator className="absolute right-2.5 flex items-center">
      <Check className="w-3.5 h-3.5 text-accent" aria-hidden />
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;
