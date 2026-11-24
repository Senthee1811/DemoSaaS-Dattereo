import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Webhook signing. The receiver verifies that a request came from SpendGuard and was not altered or replayed.
 *
 * Canonical format (documented in docs/SECURITY_HARDENING.md):
 *
 *   X-SpendGuard-Timestamp: <unix seconds, integer>
 *   X-SpendGuard-Signature: v1=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>[,v1=<hex ...>]
 *
 *  - the signed string is the timestamp, a dot, then the EXACT bytes (UTF-8) of the request body
 *  - during a secret-rotation grace window the header carries two `v1=` entries (new secret first, previous second);
 *    a receiver that knows either secret accepts the delivery, so rotation never silently invalidates in-flight retries
 *  - receivers verify with the RAW body, compare in constant time, and reject timestamps older than ~5 minutes
 *  - the secret is shown to the admin once (creation or rotation) and stored encrypted; it is never logged
 */

export const SIGNATURE_VERSION = 'v1';
export const DEFAULT_TOLERANCE_SECONDS = 300;
const ENTRY = /^v1=([0-9a-f]{64})$/;

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`;
}

export function signWebhook(secret: string, timestampSeconds: number, rawBody: string | Buffer): string {
  return `${SIGNATURE_VERSION}=${createHmac('sha256', secret).update(`${timestampSeconds}.`).update(rawBody).digest('hex')}`;
}

/** Header value for one or more currently-valid secrets (newest first). */
export function signWebhookHeader(secrets: string[], timestampSeconds: number, rawBody: string | Buffer): string {
  return secrets.map((s) => signWebhook(s, timestampSeconds, rawBody)).join(',');
}

/**
 * Receiver-side verification. `secrets` may list the current and the previous secret while a rotation is in progress.
 * Returns false (never throws) for malformed headers, stale/future timestamps, wrong secrets or modified bodies.
 */
export function verifyWebhook(
  secrets: string | string[],
  signatureHeader: string,
  timestampHeader: string,
  rawBody: string | Buffer,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): boolean {
  if (typeof timestampHeader !== 'string' || !/^\d{1,12}$/.test(timestampHeader)) return false;
  const ts = Number(timestampHeader);
  if (Math.abs(nowSeconds - ts) > toleranceSeconds) return false;
  const given = String(signatureHeader || '')
    .split(',')
    .map((p) => p.trim())
    .map((p) => ENTRY.exec(p)?.[1])
    .filter((h): h is string => Boolean(h));
  if (!given.length) return false;
  let ok = false;
  for (const secret of Array.isArray(secrets) ? secrets : [secrets]) {
    const expected = Buffer.from(signWebhook(secret, ts, rawBody).slice(SIGNATURE_VERSION.length + 1), 'hex');
    for (const g of given) if (timingSafeEqual(expected, Buffer.from(g, 'hex'))) ok = true; // no early exit: constant work
  }
  return ok;
}
