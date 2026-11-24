/**
 * "Why it changed" must say WHICH periods are compared, and must not present "no history to compare with" as
 * "no change". "What to do" must say that approving is a decision, not an action.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { InvestigationPanel } from './InvestigationPanel';
import { RecommendationsPanel } from './RecommendationsPanel';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
let body: unknown;

const base = (over: Record<string, unknown> = {}) => ({
  window: { from: '2026-11-24T10:00:00Z', to: '2026-11-25T10:00:00Z', hours: 24 },
  baseline: { from: '2026-11-17T10:00:00Z', to: '2026-11-24T10:00:00Z', days: 7, daysWithSpend: 6 },
  decomposition: { status: 'ok', baselineSpendUsd: 10, windowSpendUsd: 30, deltaUsd: 20, effects: { requestVolume: 10, tokensPerRequest: 6, pricePerToken: 4 }, dominant: 'requestVolume' },
  contributors: {},
  changePoint: null,
  sufficiency: 'high',
  evidence: { topRequests: [], anomalies: [] },
  explanations: [{ id: 'summary', kind: 'summary', text: 'Spend went up.', evidence: { requestIds: [], basis: 'ledger' } }],
  method: 'm',
  ...over,
});

beforeEach(() => {
  localStorage.setItem('spendguard_token', 't');
  localStorage.setItem('spendguard_user', JSON.stringify({ name: 'Al', role: 'ADMIN' }));
  vi.stubGlobal('fetch', vi.fn(async () => json(body)));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Why it changed: periods and "no data" versus "no change"', () => {
  it('names the compared window and the baseline period', async () => {
    body = base();
    render(<InvestigationPanel projectId="" />);
    const ranges = await screen.findByTestId('investigation-ranges');
    expect(ranges).toHaveTextContent(/Comparing .* with the 7 days before it/);
    expect(ranges).toHaveTextContent(/scaled to the same length/);
  });

  it('no comparable history is explained as such, and is NOT shown as "no change"', async () => {
    body = base({ decomposition: { status: 'no_baseline', baselineSpendUsd: 0, windowSpendUsd: 30, deltaUsd: 30, effects: null, dominant: null, note: 'There was no comparable spend before this window, so the change cannot be split into factors.' } });
    render(<InvestigationPanel projectId="" />);
    expect(await screen.findByText('Not enough history to explain the change')).toBeInTheDocument();
    expect(screen.getByText(/This is not the same as/)).toBeInTheDocument();
    expect(screen.queryByTestId('no-change')).toBeNull();
    expect(screen.queryByTestId('decomposition')).toBeNull();
  });

  it('a real zero change with enough history says so', async () => {
    body = base({ decomposition: { status: 'ok', baselineSpendUsd: 30, windowSpendUsd: 30, deltaUsd: 0, effects: { requestVolume: 0, tokensPerRequest: 0, pricePerToken: 0 }, dominant: null } });
    render(<InvestigationPanel projectId="" />);
    expect(await screen.findByTestId('no-change')).toHaveTextContent('no change worth explaining');
  });
});

describe('What to do: approval is a decision, not an action', () => {
  it('says plainly that approving changes no model, key or gateway behaviour', async () => {
    body = { recommendations: [] };
    render(<RecommendationsPanel projectId="" />);
    expect(screen.getByTestId('approval-is-not-execution')).toHaveTextContent(/does not switch models, edit keys or change any gateway behaviour/);
  });
});
