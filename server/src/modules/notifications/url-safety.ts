import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Outbound-destination safety for user-supplied webhook/Slack URLs (SSRF defence).
 *
 * A notification destination is a URL an organization admin typed in; SpendGuard's servers will POST to it. Without
 * checks it could be pointed at localhost, the cloud metadata service (169.254.169.254) or internal services.
 *
 *  - https only (http only with NOTIFICATION_ALLOW_HTTP=true, for local development and tests)
 *  - no credentials in the URL
 *  - every address the hostname resolves to must be public (no loopback, private, link-local, CGNAT, multicast,
 *    unspecified, or IPv6 unique-local) unless NOTIFICATION_ALLOW_PRIVATE_NETWORKS=true (local development and tests)
 *  - checked when the channel is created AND again just before every delivery
 *
 * Known limit: the check resolves DNS and then fetch resolves it again, so a hostile DNS server could change its
 * answer in between (DNS rebinding). Redirects are never followed, which closes the most common bypass; pinning the
 * resolved IP would close the rest and is listed as a remaining limitation.
 */

export class UnsafeDestinationError extends Error {}

const allowHttp = () => process.env.NOTIFICATION_ALLOW_HTTP === 'true';
const allowPrivate = () => process.env.NOTIFICATION_ALLOW_PRIVATE_NETWORKS === 'true';

export function isPrivateAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local incl. cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) || // IETF protocol assignments / TEST-NET-1
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224 // multicast, reserved, broadcast
    );
  }
  if (v === 6) {
    const a = address.toLowerCase();
    if (a === '::' || a === '::1') return true;
    if (a.startsWith('::ffff:')) return isPrivateAddress(a.slice(7)); // IPv4-mapped
    return a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe8') || a.startsWith('fe9') || a.startsWith('fea') || a.startsWith('feb') || a.startsWith('ff');
  }
  return true; // not an IP literal: callers only pass resolved addresses
}

/** Validates a destination URL. Returns the parsed URL; throws UnsafeDestinationError with a user-safe message. */
export async function assertSafeDestination(raw: string, opts: { hosts?: string[] } = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeDestinationError('The URL is not valid.');
  }
  if (url.protocol !== 'https:' && !(allowHttp() && url.protocol === 'http:')) throw new UnsafeDestinationError('The URL must use https.');
  if (url.username || url.password) throw new UnsafeDestinationError('The URL must not contain credentials.');
  if (opts.hosts && !opts.hosts.includes(url.hostname.toLowerCase())) throw new UnsafeDestinationError(`The URL must be on ${opts.hosts.join(' or ')}.`);

  if (!allowPrivate()) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    let addresses: string[];
    try {
      addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new UnsafeDestinationError('The host name could not be resolved.');
    }
    if (!addresses.length || addresses.some(isPrivateAddress)) throw new UnsafeDestinationError('The URL points to a private or internal network address, which is not allowed.');
  }
  return url;
}
