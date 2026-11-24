import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Webhook signing. The receiver verifies that a request came from SpendGuard and was not altered or replayed:
 *
 *   X-SpendGuard-Timestamp: <unix seconds>
 *   X-SpendGuard-Signature: v1=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
 *
 * Verify with the RAW request body, compare in constant time, and reject timestamps older than ~5 minutes.
 * The secret is shown to the admin once, when the channel is created (or rotated), and stored encrypted.
 */

export const SIGNATURE_VERSION = 'v1';
export const DEFAULT_TOLERANCE_SECONDS = 300;

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`;
}

export function signWebhook(secret: string, timestampSeconds: number, rawBody: string): string {
  return `${SIGNATURE_VERSION}=${createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex')}`;
}

export function verifyWebhook(secret: string, signatureHeader: string, timestampHeader: string, rawBody: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = DEFAULT_TOLERANCE_SECONDS): boolean {
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;
  const expected = Buffer.from(signWebhook(secret, ts, rawBody));
  const given = Buffer.from(signatureHeader || '');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
