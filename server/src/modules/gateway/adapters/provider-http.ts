import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { scrubSecrets } from '@/common/scrub-secrets';

const logger = new Logger('ProviderHttp');

/** Longest upstream message returned to a client / written to a log line. */
const MAX_MESSAGE_CHARS = 300;
const MAX_LOG_BODY_CHARS = 500;

export function providerTimeoutMs(): number {
  return Number(process.env.GATEWAY_PROXY_TIMEOUT_MS) || 60000;
}

export interface UpstreamErrorInput {
  /** Human label, e.g. 'OpenAI', 'Anthropic', 'Google Gemini', 'Groq'. */
  providerLabel: string;
  status: number;
  rawBody: string;
  /** The credential used for this call: removed from anything we echo or log. */
  apiKey?: string;
  retryAfter?: string | null;
  upstreamRequestId?: string | null;
}

interface ParsedUpstreamError {
  message?: string;
  code?: string;
}

/**
 * Pulls the message/code out of the error shapes the four providers use:
 *   OpenAI / Groq: { error: { message, type, code } }
 *   Anthropic:     { type: 'error', error: { type, message }, request_id }
 *   Gemini:        { error: { code, message, status, details: [{ reason }] } }
 * Anything else (an HTML gateway page, plain text) yields no structured fields.
 */
function parseUpstreamError(rawBody: string): ParsedUpstreamError {
  let json: any;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return {};
  }
  const err = json?.error;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  const reason = Array.isArray(err?.details) ? str(err.details.find((d: any) => str(d?.reason))?.reason) : undefined;
  return {
    message: str(err?.message) ?? str(json?.message) ?? str(err),
    code: reason ?? str(err?.code) ?? str(err?.status) ?? str(err?.type),
  };
}

/** True when the provider is telling us the credential itself is bad (not the request). */
function isCredentialRejection(status: number, parsed: ParsedUpstreamError, rawBody: string): boolean {
  if (status === 401 || status === 403) return true;
  // Gemini answers a bad key with HTTP 400 + API_KEY_INVALID, not 401.
  if (status === 400) {
    return /API_KEY_INVALID|api key not valid|invalid api key|incorrect api key/i.test(`${parsed.code ?? ''} ${parsed.message ?? ''} ${rawBody.slice(0, 2000)}`);
  }
  return false;
}

interface Classification {
  httpStatus: number;
  code: string;
  /** Include the (scrubbed) upstream message: only for failures the caller can act on. */
  includeDetail: boolean;
}

function classify(status: number, credentialRejected: boolean): Classification {
  if (credentialRejected) return { httpStatus: HttpStatus.BAD_GATEWAY, code: 'upstream_auth_failed', includeDetail: false };
  if (status === 402) return { httpStatus: HttpStatus.BAD_GATEWAY, code: 'upstream_billing_error', includeDetail: false };
  if (status === 429) return { httpStatus: HttpStatus.TOO_MANY_REQUESTS, code: 'upstream_rate_limited', includeDetail: true };
  if (status === 404) return { httpStatus: HttpStatus.NOT_FOUND, code: 'upstream_not_found', includeDetail: true };
  if ([400, 409, 413, 422].includes(status)) return { httpStatus: status, code: 'upstream_invalid_request', includeDetail: true };
  if (status === 408 || status === 504) return { httpStatus: HttpStatus.GATEWAY_TIMEOUT, code: 'upstream_timeout', includeDetail: false };
  if (status === 503 || status === 529) return { httpStatus: HttpStatus.SERVICE_UNAVAILABLE, code: 'upstream_overloaded', includeDetail: false };
  if (status >= 500) return { httpStatus: HttpStatus.BAD_GATEWAY, code: 'upstream_server_error', includeDetail: false };
  return { httpStatus: HttpStatus.BAD_GATEWAY, code: 'upstream_unexpected_status', includeDetail: false };
}

/**
 * Converts a non-2xx provider response into ONE SpendGuard error format:
 *
 *   { error: { message, type: 'upstream_provider_error', code: 'upstream_*',
 *              upstream_provider, upstream_status, upstream_code?, upstream_request_id?,
 *              retry_after_seconds? } }
 *
 * Rules:
 *  - A provider 401/403 (or Gemini's 400 API_KEY_INVALID) is the PROJECT's provider key being
 *    rejected. It is returned as 502 upstream_auth_failed, never as 401, so a client cannot
 *    mistake it for a failed SpendGuard authentication.
 *  - The raw provider body is never returned. The message is the provider's own message,
 *    scrubbed and truncated, and only for failures the caller can act on (bad request, rate limit).
 *  - Secrets (the key used for the call and known key patterns) never reach the response or the log.
 */
export function normalizeUpstreamError(input: UpstreamErrorInput): HttpException {
  const { providerLabel, status, rawBody, apiKey } = input;
  const parsed = parseUpstreamError(rawBody);
  const credentialRejected = isCredentialRejection(status, parsed, rawBody);
  const c = classify(status, credentialRejected);

  const clean = (s: string) => scrubSecrets(s, [apiKey]).replace(/\s+/g, ' ').trim();
  const detail = parsed.message ? clean(parsed.message).slice(0, MAX_MESSAGE_CHARS) : '';

  let message: string;
  switch (c.code) {
    case 'upstream_auth_failed':
      message = `${providerLabel} rejected this project's provider API key (HTTP ${status}). Check or replace the key in Key Vault. This is not a SpendGuard authentication error.`;
      break;
    case 'upstream_billing_error':
      message = `${providerLabel} reported a billing problem on the project's provider account (HTTP ${status}).`;
      break;
    case 'upstream_rate_limited':
      message = `${providerLabel} rate-limited the project's provider key (HTTP 429).${detail ? ` ${detail}` : ''}`;
      break;
    case 'upstream_timeout':
      message = `${providerLabel} timed out (HTTP ${status}).`;
      break;
    case 'upstream_overloaded':
      message = `${providerLabel} is temporarily overloaded (HTTP ${status}). Retry shortly.`;
      break;
    case 'upstream_server_error':
    case 'upstream_unexpected_status':
      message = `${providerLabel} returned an error (HTTP ${status}).`;
      break;
    default:
      message = `${providerLabel} rejected the request (HTTP ${status})${c.includeDetail && detail ? `: ${detail}` : '.'}`;
  }

  const retryAfter = Number(input.retryAfter);
  const error: Record<string, unknown> = {
    message,
    type: 'upstream_provider_error',
    code: c.code,
    upstream_provider: providerLabel,
    upstream_status: status,
  };
  if (parsed.code) error.upstream_code = clean(parsed.code).slice(0, 80);
  if (input.upstreamRequestId) error.upstream_request_id = clean(input.upstreamRequestId).slice(0, 80);
  if (Number.isFinite(retryAfter) && retryAfter > 0) error.retry_after_seconds = Math.ceil(retryAfter);

  // Debug detail for operators: scrubbed and truncated, never the key, never a stack.
  logger.warn(
    `${providerLabel} upstream HTTP ${status} -> ${c.code}` +
      `${input.upstreamRequestId ? ` (upstream request ${clean(input.upstreamRequestId)})` : ''}: ` +
      clean(rawBody).slice(0, MAX_LOG_BODY_CHARS),
  );

  return new HttpException({ error }, c.httpStatus);
}

function networkError(providerLabel: string, err: any, timedOut: boolean, timeoutMs: number, apiKey?: string): HttpException {
  const reason = scrubSecrets(String(err?.message ?? err ?? 'unknown error'), [apiKey]).slice(0, 120);
  logger.error(`${providerLabel} ${timedOut ? 'timeout' : 'network error'}: ${reason}`);
  return new HttpException(
    {
      error: timedOut
        ? {
            message: `${providerLabel} did not complete the response within ${Math.round(timeoutMs / 1000)}s.`,
            type: 'upstream_provider_error',
            code: 'upstream_timeout',
            upstream_provider: providerLabel,
          }
        : {
            message: `Could not reach ${providerLabel}.`,
            type: 'upstream_provider_error',
            code: 'upstream_network_error',
            upstream_provider: providerLabel,
          },
    },
    HttpStatus.GATEWAY_TIMEOUT,
  );
}

export interface ProviderPostOptions {
  providerLabel: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  /** Sent upstream; removed from any error text. */
  apiKey: string;
}

/**
 * POSTs JSON to a provider and returns the parsed 2xx body.
 *
 * ONE deadline covers connecting, the response headers AND reading the whole body: the timer is
 * only cleared after the body has been read. (Previously it was cleared as soon as headers
 * arrived, so a provider that stalled mid-body hung the request — and its budget hold — until
 * the hold expired.)
 *
 * Every failure is thrown as a normalized HttpException; see normalizeUpstreamError.
 */
export async function postProviderJson(opts: ProviderPostOptions): Promise<any> {
  const timeoutMs = providerTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let resp: Response;
    let text: string;
    try {
      resp = await fetch(opts.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...opts.headers },
        body: JSON.stringify(opts.body),
        signal: controller.signal,
      });
      text = await resp.text(); // inside the deadline
    } catch (err: any) {
      throw networkError(opts.providerLabel, err, controller.signal.aborted, timeoutMs, opts.apiKey);
    }

    if (!resp.ok) {
      throw normalizeUpstreamError({
        providerLabel: opts.providerLabel,
        status: resp.status,
        rawBody: text,
        apiKey: opts.apiKey,
        retryAfter: resp.headers?.get('retry-after'),
        upstreamRequestId: resp.headers?.get('request-id') ?? resp.headers?.get('x-request-id'),
      });
    }

    try {
      return JSON.parse(text);
    } catch {
      logger.error(`${opts.providerLabel} returned a 2xx response that is not JSON`);
      throw new HttpException(
        {
          error: {
            message: `${opts.providerLabel} returned an unreadable response.`,
            type: 'upstream_provider_error',
            code: 'upstream_invalid_response',
            upstream_provider: opts.providerLabel,
          },
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

/** A finite, non-negative integer from provider usage, or undefined when absent/garbage. */
export function usageInt(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined;
}

/** Pre-flight rejection raised by SpendGuard itself (nothing was sent upstream). */
export function invalidMessagesError(message: string): HttpException {
  return new HttpException(
    { error: { message, type: 'invalid_request_error', code: 'invalid_messages' } },
    HttpStatus.BAD_REQUEST,
  );
}
