import { Transform } from 'class-transformer';

/**
 * Shared input limits. Money columns are Decimal(12, 4): at most 8 integer digits.
 * Text caps are generous for real names and stop megabyte-sized values reaching the DB.
 */
export const LIMITS = {
  MAX_BUDGET_USD: 99_999_999,
  MIN_BUDGET_USD: 0.0001, // smallest positive value Decimal(12, 4) can store
  NAME: 120,
  DESCRIPTION: 2000,
  REASON: 500,
  SECRET: 512,
  EMAIL: 254,
  MAX_RPM: 100_000,
  MAX_TPM: 100_000_000,
  MAX_MODELS: 200,
  MODEL_ID: 200,
} as const;

/** Trims strings; leaves other values for the validators to reject. */
export const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
