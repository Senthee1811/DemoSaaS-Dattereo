/**
 * Numeric ranges the API accepts. Mirrors server/src/common/validation.ts (LIMITS) so forms
 * never accept a value the server will reject, and never reject one it would accept.
 */
export interface NumberRange {
  min: number;
  max: number;
  integer?: boolean;
}

export const BUDGET_USD: NumberRange = { min: 0.0001, max: 99_999_999 };
export const RATE_LIMIT_RPM: NumberRange = { min: 1, max: 100_000, integer: true };
export const RATE_LIMIT_TPM: NumberRange = { min: 1, max: 100_000_000, integer: true };

/** The problem with a typed value, or null when the server will accept it. */
export function numberProblem(value: string, range: NumberRange): string | null {
  if (value.trim() === '') return 'Enter a number.';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Enter a number.';
  if (range.integer && !Number.isInteger(n)) return 'Enter a whole number.';
  if (n < range.min || n > range.max) {
    const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });
    return `Must be between ${fmt(range.min)} and ${fmt(range.max)}.`;
  }
  return null;
}

export const isNumberInRange = (value: string, range: NumberRange) => numberProblem(value, range) === null;
