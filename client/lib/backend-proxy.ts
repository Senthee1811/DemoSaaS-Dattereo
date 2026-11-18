import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side base URL of the NestJS backend. Only read on the server
 * (route handlers), never shipped to the browser.
 */
export const BACKEND_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');

/** Request headers that are safe and necessary to forward to the backend. */
const FORWARDED_REQUEST_HEADERS = [
  'authorization',
  'content-type',
  'x-spendguard-key',
  'x-spendguard-project-id',
  'x-project-id',
  'x-request-id',
  'stripe-signature',
  'user-agent',
];

/** Response headers the browser needs to see (governance telemetry, downloads, rate limits). */
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-disposition',
  'x-spendguard-cost',
  'x-spendguard-latency',
  'x-spendguard-blocked',
  'x-request-id',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
];

interface ProxyOptions {
  /** Backend path, e.g. `/api/v1/projects`. The incoming query string is appended automatically. */
  path: string;
  /** Request timeout in ms (default 30s; gateway calls pass a longer one). */
  timeoutMs?: number;
}

/**
 * Forwards the incoming request to the backend verbatim: method, query string,
 * body, auth and governance headers. Backend status codes and error bodies are
 * passed through unchanged so the UI can react to 401/403/404/429 correctly.
 *
 * When the backend is unreachable this returns an explicit 503 — it never
 * fabricates empty "success" data that would hide an outage.
 */
export async function proxyToBackend(req: NextRequest, { path, timeoutMs = 30_000 }: ProxyOptions): Promise<NextResponse> {
  const incomingUrl = new URL(req.url);
  const target = `${BACKEND_URL}${path}${incomingUrl.search}`;

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  // Preserve the real client address for backend logging / rate limiting
  // (only honoured by the backend when TRUST_PROXY is configured).
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (clientIp) headers.set('x-forwarded-for', clientIp);

  const method = req.method.toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstream = await fetch(target, {
      method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
    });

    const responseHeaders = new Headers();
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    const payload = upstream.status === 204 ? null : await upstream.arrayBuffer();
    return new NextResponse(payload, { status: upstream.status, headers: responseHeaders });
  } catch (err: unknown) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    console.error(`[proxy] ${method} ${path} failed:`, err instanceof Error ? err.message : err);
    return NextResponse.json(
      {
        error: {
          message: aborted
            ? 'The SpendGuard API took too long to respond. Please try again.'
            : 'The SpendGuard API is unreachable right now. Please try again shortly.',
          type: aborted ? 'upstream_timeout' : 'backend_unavailable',
        },
      },
      { status: aborted ? 504 : 503 },
    );
  } finally {
    clearTimeout(timer);
  }
}
