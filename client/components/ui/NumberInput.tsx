'use client';

import React, { useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import { numberProblem, type NumberRange } from '@/lib/limits';
import { Tip } from '@/components/ui/tooltip';

/**
 * The one numeric field (shadcn Input pattern + steppers). Ranges come from lib/limits.ts,
 * which mirrors the server. Typed values are never silently clamped: an out-of-range value
 * shows why and the form's submit stays disabled. The steppers only move within the range.
 */
export function NumberInput({
  id,
  value,
  onValueChange,
  range,
  step = 1,
  prefix,
  'aria-label': ariaLabel,
  disabled,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  range: NumberRange;
  /** Stepper increment. */
  step?: number;
  /** Shown inside the field, e.g. "$". */
  prefix?: React.ReactNode;
  'aria-label'?: string;
  disabled?: boolean;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  const problem = value === '' ? null : numberProblem(value, range);

  const stepBy = (dir: 1 | -1) => {
    const current = Number(value);
    const base = Number.isFinite(current) && value.trim() !== '' ? current : range.min;
    let next = base + dir * step;
    next = Math.min(range.max, Math.max(range.min, next));
    if (range.integer) next = Math.round(next);
    // Avoid float noise like 1000.0000000001
    onValueChange(String(Number(next.toFixed(4))));
  };

  const atMin = Number(value) <= range.min;
  const atMax = Number(value) >= range.max;
  const btn =
    'h-full px-2.5 text-fg-secondary hover:text-fg hover:bg-surface-muted disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <div className="space-y-1">
      <div
        className={`flex items-stretch rounded-field border bg-surface overflow-hidden focus-within:border-accent ${
          problem ? 'border-critical' : 'border-line'
        }`}
      >
        <Tip label="Decrease">
          <button type="button" className={`${btn} border-r border-line`} onClick={() => stepBy(-1)} disabled={disabled || atMin} aria-label="Decrease">
          <Minus className="w-3.5 h-3.5" />
        </button>
        </Tip>
        {prefix && <span className="flex items-center pl-3 text-fg-muted font-mono text-xs select-none">{prefix}</span>}
        <input
          id={inputId}
          type="text"
          inputMode={range.integer ? 'numeric' : 'decimal'}
          value={value}
          onChange={(e) => onValueChange(e.target.value.replace(/[^\d.]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              stepBy(1);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              stepBy(-1);
            }
          }}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? errorId : undefined}
          role="spinbutton"
          aria-valuemin={range.min}
          aria-valuemax={range.max}
          aria-valuenow={Number.isFinite(Number(value)) && value !== '' ? Number(value) : undefined}
          className="flex-1 min-w-0 px-3 py-2.5 bg-transparent font-mono text-xs text-fg focus:outline-none tabular-nums"
        />
        <Tip label="Increase">
          <button type="button" className={`${btn} border-l border-line`} onClick={() => stepBy(1)} disabled={disabled || atMax} aria-label="Increase">
          <Plus className="w-3.5 h-3.5" />
        </button>
        </Tip>
      </div>
      {problem && (
        <p id={errorId} role="alert" className="text-label text-critical">
          {problem}
        </p>
      )}
    </div>
  );
}
