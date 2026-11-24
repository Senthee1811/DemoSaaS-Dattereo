import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Outbound-destination safety for user-supplied webhook/Slack URLs (SSRF defence).
 *
 * This module validates and RESOLVES a destination. The resolved, validated addresses are then handed to
 * `safe-http.ts`, which connects to exactly those addresses (connection pinning) while keeping the original
 * hostname for the Host header, TLS SNI and certificate verification. The hostname is therefore never resolved a
 * second time by the HTTP stack, which is what closes DNS rebinding.
 *
 *  - https only (http only with NOTIFICATION_ALLOW_HTTP=true, for local development and tests)
 *  - no credentials, default port 443 only unless listed in NOTIFICATION_ALLOWED_PORTS
 *  - no localhost / internal-looking host names; IP literals are checked directly
 *  - EVERY address a host resolves to must be public (loopback, private, link-local incl. cloud metadata, CGNAT,
 *    multicast, reserved, IPv6 ULA/link-local/NAT64/6to4 wrapping a private IPv4 are all refused)
 *  - resolution failure or an empty answer is a rejection, never a bypass
 *  - validated at creation AND again immediately before every delivery
 */

export class UnsafeDestinationError extends Error {}

export type Resolver = (hostname: string) => Promise<string[]>;
export const systemResolver: Resolver = async (hostname) => (await lookup(hostname, { all: true })).map((a) => a.address);

const allowHttp = () => process.env.NOTIFICATION_ALLOW_HTTP === 'true';
const allowPrivate = () => process.env.NOTIFICATION_ALLOW_PRIVATE_NETWORKS === 'true';
const extraPorts = () =>
  (process.env.NOTIFICATION_ALLOWED_PORTS ?? '')
    .split(',')
    .map((p) => Number(p.trim()))
    .filter((p) => Number.isInteger(p) && p > 0 && p < 65536);

const INTERNAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.intranet', '.localdomain'];

function isPrivateV4(address: string): boolean {
  const p = address.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 0 && c === 2) || // TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Expands any valid IPv6 text form (including trailing dotted IPv4) into eight 16-bit groups, or null. */
function expandV6(address: string): number[] | null {
  let a = address.toLowerCase().split('%')[0];
  const dotted = a.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const o = dotted[1].split('.').map(Number);
    if (o.some((n) => n > 255)) return null;
    a = a.slice(0, -dotted[1].length) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16);
  }
  const halves = a.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

const v4From = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

export function isPrivateAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) return isPrivateV4(address);
  if (v === 6) {
    const g = expandV6(address);
    if (!g) return true;
    if (g.every((x) => x === 0)) return true; // ::
    if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
    if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return isPrivateV4(v4From(g[6], g[7])); // ::ffff:a.b.c.d and deprecated ::a.b.c.d
    if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPrivateV4(v4From(g[6], g[7])); // NAT64
    if (g[0] === 0x2002) return isPrivateV4(v4From(g[1], g[2])); // 6to4
    if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
    if ((g[0] & 0xff00) === 0xff00) return true; // multicast
    if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
    if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return true; // discard prefix
    return false;
  }
  return true; // not an IP literal: callers only pass resolved addresses
}

export interface ResolvedDestination {
  url: URL;
  /** Validated addresses the connection may use. Empty only when private networks are explicitly allowed (dev/test). */
  addresses: string[];
}

/** Validates a destination and resolves it ONCE. Throws UnsafeDestinationError with a user-safe message. */
export async function resolveDestination(raw: string, opts: { hosts?: string[]; resolver?: Resolver } = {}): Promise<ResolvedDestination> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeDestinationError('The URL is not valid.');
  }
  if (url.protocol !== 'https:' && !(allowHttp() && url.protocol === 'http:')) throw new UnsafeDestinationError('The URL must use https.');
  if (url.username || url.password) throw new UnsafeDestinationError('The URL must not contain credentials.');
  const defaultPort = url.protocol === 'https:' ? 443 : 80;
  const port = url.port ? Number(url.port) : defaultPort;
  if (!allowPrivate() && port !== defaultPort && !extraPorts().includes(port)) throw new UnsafeDestinationError('That port is not allowed.');
  const hostname = url.hostname.toLowerCase();
  if (opts.hosts && !opts.hosts.includes(hostname)) throw new UnsafeDestinationError(`The URL must be on ${opts.hosts.join(' or ')}.`);

  const host = hostname.replace(/^\[|\]$/g, '');
  const literal = isIP(host) !== 0;
  if (!allowPrivate()) {
    if (!literal && (host === 'localhost' || !host.includes('.') || INTERNAL_SUFFIXES.some((s) => host.endsWith(s)))) {
      throw new UnsafeDestinationError('Internal host names are not allowed.');
    }
    let addresses: string[];
    try {
      addresses = literal ? [host] : await (opts.resolver ?? systemResolver)(host);
    } catch {
      throw new UnsafeDestinationError('The host name could not be resolved.');
    }
    if (!addresses.length || addresses.some(isPrivateAddress)) throw new UnsafeDestinationError('The URL points to a private or internal network address, which is not allowed.');
    return { url, addresses: [...new Set(addresses)] };
  }
  // Development / test only: private networks permitted. Still resolve so the connection is pinned the same way.
  let addresses: string[] = [];
  try {
    addresses = literal ? [host] : await (opts.resolver ?? systemResolver)(host);
  } catch {
    throw new UnsafeDestinationError('The host name could not be resolved.');
  }
  return { url, addresses: [...new Set(addresses)] };
}

/** Validation-only wrapper kept for callers that just need a yes/no at channel creation. */
export async function assertSafeDestination(raw: string, opts: { hosts?: string[]; resolver?: Resolver } = {}): Promise<URL> {
  return (await resolveDestination(raw, opts)).url;
}
