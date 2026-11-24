/**
 * What a failed gateway call tells us about money.
 *
 * A failure released its reservation and wrote NO spend to the ledger. That is right when the provider rejected the
 * request before running it, but a timeout, a dropped connection, a 5xx, or a 2xx we could not read may mean the provider
 * did run (and bill) it. We do not know, so we never call such an attempt "free": it is classified, kept, and
 * surfaced as unreconciled exposure until a human compares it with the provider invoice.
 *
 *   executionStatus  NOT_SENT             SpendGuard refused it before contacting the provider (nothing left the building)
 *                    REJECTED_BY_PROVIDER the provider answered 4xx: it refused the request (auth, invalid, rate limit, billing)
 *                    PROVIDER_ERROR       the provider answered 5xx/overloaded: execution may have started
 *                    EXECUTION_UNKNOWN    timeout / connection lost / unexpected internal error: we cannot tell
 *                    RESPONSE_UNUSABLE    the provider answered 2xx but the body was unreadable: it DID run
 *   billingStatus    NOT_EXPECTED         rejected or never sent: no charge is expected
 *                    UNCERTAIN            the provider may have charged; unknown
 *                    LIKELY_CHARGED       the provider ran the request; usage is simply unknown to us
 */
export type ExecutionStatus = 'NOT_SENT' | 'REJECTED_BY_PROVIDER' | 'PROVIDER_ERROR' | 'EXECUTION_UNKNOWN' | 'RESPONSE_UNUSABLE';
export type BillingStatus = 'NOT_EXPECTED' | 'UNCERTAIN' | 'LIKELY_CHARGED';

export function classifyAttempt(input: { errorClass: string; upstreamStatus?: number | null }): { executionStatus: ExecutionStatus; billingStatus: BillingStatus } {
  const { errorClass, upstreamStatus } = input;
  if (errorClass === 'upstream_invalid_response') return { executionStatus: 'RESPONSE_UNUSABLE', billingStatus: 'LIKELY_CHARGED' };
  if (errorClass === 'upstream_timeout' || errorClass === 'upstream_network_error') return { executionStatus: 'EXECUTION_UNKNOWN', billingStatus: 'UNCERTAIN' };
  if (typeof upstreamStatus === 'number') {
    if (upstreamStatus >= 500) return { executionStatus: 'PROVIDER_ERROR', billingStatus: 'UNCERTAIN' };
    if (upstreamStatus >= 400) return { executionStatus: 'REJECTED_BY_PROVIDER', billingStatus: 'NOT_EXPECTED' };
    return { executionStatus: 'EXECUTION_UNKNOWN', billingStatus: 'UNCERTAIN' }; // an unexpected 1xx/3xx
  }
  if (errorClass === 'upstream_server_error' || errorClass === 'upstream_overloaded') return { executionStatus: 'PROVIDER_ERROR', billingStatus: 'UNCERTAIN' };
  if (['upstream_auth_failed', 'upstream_rate_limited', 'upstream_billing_error', 'upstream_invalid_request'].includes(errorClass)) {
    return { executionStatus: 'REJECTED_BY_PROVIDER', billingStatus: 'NOT_EXPECTED' };
  }
  if (errorClass === 'internal_error' || errorClass === 'upstream_unexpected_status') return { executionStatus: 'EXECUTION_UNKNOWN', billingStatus: 'UNCERTAIN' };
  // Everything else is raised by SpendGuard itself before any provider call (missing_provider_key, invalid_messages, ...)
  return { executionStatus: 'NOT_SENT', billingStatus: 'NOT_EXPECTED' };
}
