/**
 * Failed-call exposure and estimator accuracy in the Audit view.
 *  - members see an explanation, not the data
 *  - exposure is labelled as an upper bound, never as spend
 *  - recording an outcome needs a confirmation, sends exactly what was chosen, and is not possible without an amount
 *    when "charged" is chosen
 *  - estimator verdicts are shown with their sample sizes; "not enough data" is visible as such
 *  - malformed responses do not crash the view
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ReconciliationPanel } from './ReconciliationPanel';
import { AuditView } from './AuditView';
import { ScopeProvider } from '@/lib/scope';

const InScope = () => (
  <ScopeProvider scopeId="" onScopeChange={() => {}} projects={[]}>
    <AuditView />
  </ScopeProvider>
);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let patches: Array<{ url: string; body: unknown }>;
let exposure: unknown;
let attempts: unknown;
let accuracy: unknown;
let logs: unknown;

beforeEach(() => {
  localStorage.setItem('spendguard_token', 't');
  localStorage.setItem('spendguard_user', JSON.stringify({ name: 'Al', orgName: 'Acme', role: 'ADMIN' }));
  patches = [];
  exposure = { unreconciled: [{ provider: 'OPENAI', billingStatus: 'UNCERTAIN', attempts: 2, maxExposureUsd: 0.5 }, { provider: 'ANTHROPIC', billingStatus: 'LIKELY_CHARGED', attempts: 1, maxExposureUsd: 1.25 }], confirmedUnledgeredUsd: [] };
  attempts = { attempts: [{ id: 'req_1', projectName: 'Support', provider: 'OPENAI', model: 'gpt-4o', errorClass: 'upstream_timeout', executionStatus: 'EXECUTION_UNKNOWN', billingStatus: 'UNCERTAIN', estimatedCostUsd: 0.25, timestamp: '2026-11-25T10:00:00Z' }] };
  accuracy = { windowDays: 30, providers: [{ provider: 'OPENAI', sufficient: false, verdict: 'insufficient_data', samples: 120, requiredSamples: 1000, spanDays: 3, requiredSpanDays: 14, note: 'Not enough evidence to change a margin. Keep the current margin.' }], groups: [{ provider: 'OPENAI', model: 'gpt-4o', estimatorVersion: 'v2', samples: 120, indicativeOnly: true, underestimatedPct: 12.5, reservationUnderCoveredInputPct: 0, estimateToActualRatio: { p50: 1.08, p95: 1.4 }, marginNeededForP99Coverage: 1.1, financialOverrun: { requests: 0, usd: 0, pctOfCost: 0 } }] };
  logs = { logs: [] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? 'GET') === 'PATCH') {
        patches.push({ url, body: JSON.parse(String(init?.body)) });
        return json({ id: 'req_1', reconciledStatus: 'NOT_CHARGED_CONFIRMED' });
      }
      if (url.includes('/attempts/exposure')) return json(exposure);
      if (url.includes('/audit/attempts')) return json(attempts);
      if (url.includes('/estimator-accuracy')) return json(accuracy);
      if (url.includes('/api/v1/audit')) return json(logs);
      return json({}, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('ReconciliationPanel', () => {
  it('members get an explanation and no data', () => {
    localStorage.setItem('spendguard_user', JSON.stringify({ name: 'Mo', role: 'MEMBER' }));
    render(<ReconciliationPanel />);
    expect(screen.getByText(/Only an owner or admin/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows exposure as an upper bound with its explanation, never as spend', async () => {
    render(<ReconciliationPanel />);
    expect(await screen.findByTestId('exposure-total')).toHaveTextContent('$1.75');
    expect(screen.getByText('Exposure is not spend')).toBeInTheDocument();
    expect(screen.getByText(/Unreconciled exposure \(upper bound\)/)).toBeInTheDocument();
    expect(screen.getByText(/changes no ledger entry or budget figure/)).toBeInTheDocument();
  });

  it('lists the failed call in plain words with its billing state', async () => {
    render(<ReconciliationPanel />);
    const row = await screen.findByTestId('exposure-row');
    expect(within(row).getByText('Timed out / connection lost')).toBeInTheDocument();
    expect(within(row).getByText('May have been billed')).toBeInTheDocument();
  });

  it('recording "not on the invoice" asks for confirmation, then sends exactly that', async () => {
    render(<ReconciliationPanel />);
    await screen.findByTestId('exposure-row');
    fireEvent.click(screen.getByRole('button', { name: 'Record outcome' }));
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: 'INV-77' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(patches).toHaveLength(0); // nothing before confirming
    fireEvent.click(await screen.findByRole('button', { name: 'Record outcome' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toContain('/api/v1/audit/attempts/req_1/reconcile');
    expect(patches[0].body).toEqual({ status: 'NOT_CHARGED_CONFIRMED', note: 'INV-77' });
  });

  it('"charged" cannot be saved without a valid amount, and sends the amount when given', async () => {
    render(<ReconciliationPanel />);
    await screen.findByTestId('exposure-row');
    fireEvent.click(screen.getByRole('button', { name: 'Record outcome' }));
    fireEvent.click(screen.getByLabelText('Charged'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Invoiced amount/), { target: { value: '-3' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Invoiced amount/), { target: { value: '0.42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Record outcome' }));
    await waitFor(() => expect(patches[0]?.body).toEqual({ status: 'CHARGED_CONFIRMED', costUsd: 0.42 }));
  });

  it('estimator accuracy shows the verdict with the sample sizes, and marks small samples', async () => {
    render(<ReconciliationPanel />);
    const p = await screen.findByTestId('estimator-provider');
    expect(within(p).getByText('Not enough data')).toBeInTheDocument();
    expect(p).toHaveTextContent('120 of 1,000 samples');
    expect(p).toHaveTextContent(/Keep the current margin/);
    expect(screen.getByText('indicative only')).toBeInTheDocument();
  });

  it('an empty queue says there is nothing to reconcile', async () => {
    attempts = { attempts: [] };
    exposure = { unreconciled: [], confirmedUnledgeredUsd: [] };
    render(<ReconciliationPanel />);
    expect(await screen.findByText('Nothing to reconcile')).toBeInTheDocument();
  });

  it('malformed responses degrade to empty states instead of crashing', async () => {
    exposure = { unreconciled: 'nope' };
    attempts = { attempts: null };
    accuracy = { providers: 5 };
    render(<ReconciliationPanel />);
    expect(await screen.findByTestId('exposure-total')).toHaveTextContent('$0.00');
  });
});

describe('AuditView', () => {
  it('switches between the request ledger and the reconciliation section', async () => {
    render(<InScope />);
    expect(screen.getByRole('button', { name: 'Requests' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Failed calls & estimates' }));
    expect(await screen.findByTestId('reconciliation')).toBeInTheDocument();
  });

  it('marks estimated usage and reservation overruns on a ledger row, and makes no unbacked integrity claim', async () => {
    logs = { logs: [{ id: 'req_a', projectId: 'p', projectName: 'Support', userId: 'u', provider: 'OPENAI', model: 'gpt-4o', tokensIn: 10, tokensOut: 5, totalTokens: 15, costEstimate: 0.01, latencyMs: 5, statusCode: 200, isAnomaly: false, isBlocked: false, usageStatus: 'ESTIMATED', reservedCost: 0.008, reservationOverrun: 0.002, timestamp: '2026-11-25T10:00:00Z' }] };
    render(<InScope />);
    expect(await screen.findByText('estimated')).toBeInTheDocument();
    expect(screen.getByText('+$0.00200 over reserve')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/cryptographically/i);
  });
});
