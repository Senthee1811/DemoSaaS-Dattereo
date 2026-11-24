import * as http from 'http';
import * as https from 'https';
import { LookupFunction } from 'net';
import { resolveDestination, Resolver } from './url-safety';

/**
 * A small outbound POST client whose connection is PINNED to addresses we validated ourselves.
 *
 * Why not fetch(): fetch resolves the hostname again, after our check, so a hostile DNS server can answer with a public
 * address for the check and an internal one for the connection (DNS rebinding). Here the hostname is resolved exactly
 * once (resolveDestination), every answer is validated, and the socket is opened through a `lookup` override that can
 * only return those validated addresses. The URL keeps its hostname, so the Host header, TLS SNI and certificate
 * verification still use the original name (we never rewrite the URL to an IP).
 *
 *  - redirects are never followed (3xx is returned to the caller as a status)
 *  - connect + total timeout, response body capped (we only need the status)
 *  - the exact bytes of `body` are what is transmitted (Content-Length is computed from the same Buffer)
 */

export class OutboundError extends Error {
  constructor(message: string, readonly kind: 'timeout' | 'network' | 'too_large' | 'tls') {
    super(message);
  }
}

export interface PostOptions {
  headers?: Record<string, string>;
  hosts?: string[];
  timeoutMs?: number;
  maxResponseBytes?: number;
  resolver?: Resolver;
  /** Extra trusted CA (tests only: lets a local TLS server with a private CA be verified normally). */
  ca?: string | Buffer;
  /** Test seam: replaces https.request / http.request. */
  requestImpl?: typeof https.request;
}

export interface PostResult {
  status: number;
  /** The address the socket was actually opened to (for audit/tests). */
  connectedTo?: string;
}

export async function safePost(rawUrl: string, body: string, opts: PostOptions = {}): Promise<PostResult> {
  // Throws UnsafeDestinationError before any connection is attempted
  const { url, addresses } = await resolveDestination(rawUrl, { hosts: opts.hosts, resolver: opts.resolver });
  const payload = Buffer.from(body, 'utf8');
  const timeoutMs = opts.timeoutMs ?? 5000;
  const maxBytes = opts.maxResponseBytes ?? 64 * 1024;
  const secure = url.protocol === 'https:';
  const request = opts.requestImpl ?? (secure ? https.request : http.request);

  let connectedTo: string | undefined;
  // Only validated addresses can ever be returned; the system resolver is never consulted for the pinned host.
  const pinnedLookup = ((_host: string, options: any, cb: any) => {
    const list = addresses.map((a) => ({ address: a, family: a.includes(':') ? 6 : 4 }));
    if (!list.length) return cb(new Error('no validated address'));
    connectedTo = list[0].address;
    if (options?.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  }) as LookupFunction;

  return new Promise<PostResult>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(total);
      fn();
    };
    const req = request(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ''),
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: { ...(opts.headers ?? {}), 'Content-Length': String(payload.length) },
        lookup: addresses.length ? pinnedLookup : undefined,
        servername: secure ? url.hostname.replace(/^\[|\]$/g, '') : undefined,
        ca: opts.ca,
        agent: false, // no connection reuse across destinations
        timeout: timeoutMs,
      } as https.RequestOptions,
      (res) => {
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            res.destroy();
            req.destroy();
            done(() => reject(new OutboundError('The destination response was too large', 'too_large')));
          }
        });
        res.on('end', () => done(() => resolve({ status: res.statusCode ?? 0, connectedTo })));
        res.on('error', () => done(() => reject(new OutboundError('Could not read the destination response', 'network'))));
      },
    );
    const total = setTimeout(() => {
      req.destroy();
      done(() => reject(new OutboundError('timeout', 'timeout')));
    }, timeoutMs);
    req.on('timeout', () => {
      req.destroy();
      done(() => reject(new OutboundError('timeout', 'timeout')));
    });
    req.on('error', (err: any) => {
      const tls = /certificate|altname|self.signed|SSL|TLS|hostname/i.test(`${err?.code} ${err?.message}`);
      // Never echo err.message: it can contain the destination host
      done(() => reject(new OutboundError(tls ? 'TLS verification failed' : 'network', tls ? 'tls' : 'network')));
    });
    req.end(payload);
  });
}
