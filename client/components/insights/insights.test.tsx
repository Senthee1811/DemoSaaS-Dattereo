/**
 * Cost Insights: what the UI must never blur.
 *  - an ACTUAL figure and a FORECAST figure are labelled differently, and with too little history no projection is shown
 *  - unattributed spend is its own visibly-labelled row
 *  - a recommendation's evidence/method/impact basis/confidence are visible, and approval is gated and explained
 *  - model comparison is always presented as cost-only
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ForecastPanel, chartPoints } from './ForecastPanel';
import { SpendBreakdownPanel } from './SpendBreakdownPanel';
import { RecommendationsPanel } from './RecommendationsPanel';
import { ModelComparisonPanel } from './ModelComparisonPanel';
import { impactText, usd, signedUsd, evidenceText } from '@/lib/insights';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let routes: Record<string, (init?: RequestInit) => Response>;
let calls: Array<{ url: string; method: string; body?: unknown }>;

function mockApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const key = Object.keys(routes).find((k) => url.includes(k));
      return key ? routes[key](init) : json({}, 404);
    }),
  );
}

beforeEach(() => {
  localStorage.setItem('spendguard_token', 't');
  localStorage.setItem('spendguard_user', JSON.stringify({ name: 'Alice', orgName: 'Acme', role: 'ADMIN' }));
  calls = [];
  routes = {};
  mockApi();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const forecast = (over: Record<string, unknown> = {}) => ({
  month: '2026-11',
  actual: { monthToDateUsd: 144, todaySoFarUsd: 4, observedDays: 14, avgDailyBurnUsd: 10, trailing7DayBurnUsd: 10 },
  forecast: { projectedMonthEndUsd: 300, lowUsd: 273, highUsd: 327, rangeCoverage: '≈80% (assumes independent days)', daysRemainingIncludingToday: 16 },
  sufficiency: 'high',
  sufficiencyNote: 'Based on 14 complete days of spend.',
  warnings: [],
  budget: { budgetUsd: 250, status: 'likely_exceed', remainingUsd: 106, percentUsed: 57.6, projectedExceedDate: '2026-11-25', statusNote: 'Even the low end of the projected range is above the budget.' },
  days: [
    { date: '2026-11-14', kind: 'actual', spendUsd: 10, cumulativeUsd: 140 },
    { date: '2026-11-15', kind: 'actual', partial: true, spendUsd: 4, cumulativeUsd: 144 },
    { date: '2026-11-16', kind: 'forecast', spendUsd: 10, cumulativeUsd: 160, cumulativeLowUsd: 150, cumulativeHighUsd: 170 },
  ],
  method: 'Run-rate projection…',
  ...over,
});

describe('Forecast panel', () => {
  it('keeps the actual and the predicted figure apart, labelled, with the range and the budget verdict', async () => {
    routes['/forecast'] = () => json(forecast());
    render(<ForecastPanel projectId="" />);
    await waitFor(() => expect(screen.getByTestId('forecast-actual')).toHaveTextContent('$144'));
    expect(screen.getByText('Actual')).toBeInTheDocument();
    expect(screen.getByText('Forecast')).toBeInTheDocument();
    expect(screen.getByTestId('forecast-projected')).toHaveTextContent('$300');
    expect(screen.getByTestId('forecast-range')).toHaveTextContent('between $273 and $327');
    expect(screen.getByText('Likely to exceed')).toBeInTheDocument();
    expect(screen.getByText(/reached around 2026-11-25 \(projection\)/)).toBeInTheDocument();
  });

  it('with too little history it shows NO projected number, only the actual and the reason', async () => {
    routes['/forecast'] = () =>
      json(forecast({ forecast: null, sufficiency: 'insufficient', sufficiencyNote: 'Only 2 complete days of spend are available; at least 3 are needed before a projection is shown.', actual: { monthToDateUsd: 19, todaySoFarUsd: 2, observedDays: 2, avgDailyBurnUsd: 8.5, trailing7DayBurnUsd: 8.5 }, budget: null, days: [] }));
    render(<ForecastPanel projectId="" />);
    await waitFor(() => expect(screen.getByTestId('forecast-unavailable')).toBeInTheDocument());
    expect(screen.queryByTestId('forecast-projected')).toBeNull();
    expect(screen.getByTestId('forecast-actual')).toHaveTextContent('$19');
    expect(screen.getByText('Not enough data', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/at least 3 are needed/)).toBeInTheDocument();
  });

  it('shows every warning the backend raised (an uneven run rate is not hidden)', async () => {
    routes['/forecast'] = () => json(forecast({ warnings: ['Daily spend is very uneven, so the projection is less reliable.'], sufficiency: 'medium' }));
    render(<ForecastPanel projectId="" />);
    await waitFor(() => expect(screen.getByText(/very uneven/)).toBeInTheDocument());
  });

  it('a new account with nothing spent gets an explanation, not a zero forecast', async () => {
    routes['/forecast'] = () => json(forecast({ forecast: null, actual: { monthToDateUsd: 0, todaySoFarUsd: 0, observedDays: 0, avgDailyBurnUsd: null, trailing7DayBurnUsd: null }, budget: null, days: [] }));
    render(<ForecastPanel projectId="" />);
    await waitFor(() => expect(screen.getByText('Nothing to forecast yet')).toBeInTheDocument());
  });

  it('surfaces a backend failure instead of an empty page', async () => {
    routes['/forecast'] = () => json({ error: { message: 'Project not found' } }, 404);
    render(<ForecastPanel projectId="p1" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Could not load the forecast/));
  });

  it('chart points: actual and forecast are separate series that join at the last actual point', () => {
    const pts = chartPoints(forecast().days as never);
    expect(pts[0]).toMatchObject({ actual: 140 });
    expect(pts[0].predicted).toBeUndefined();
    expect(pts[1]).toMatchObject({ actual: 144, predicted: 144 }); // the join
    expect(pts[2]).toMatchObject({ predicted: 160, band: [150, 170] });
    expect(pts[2].actual).toBeUndefined();
  });
});

describe('Spend breakdown', () => {
  const attribution = {
    dimension: 'application',
    totals: { costUsd: 192, requests: 840, tokens: 1_000_000 },
    rows: [
      { key: 'chat', label: 'chat', unattributed: false, costUsd: 140, share: 0.729, requests: 700, tokens: 840_000, tokensPerRequest: 1200, costPerRequestUsd: 0.2 },
      { key: null, label: 'Unattributed', unattributed: true, costUsd: 52, share: 0.271, requests: 140, tokens: 160_000, tokensPerRequest: 1142, costPerRequestUsd: 0.37 },
    ],
    coverage: { attributedShare: 0.729, unattributedUsd: 52, note: 'never allocated' },
    howToAttribute: { keyLevel: 'Assign an application when creating a key.', headers: { 'X-SpendGuard-Application': 'Application name' }, precedence: 'A dimension set on the key wins over a header.' },
  };

  it('shows unattributed spend as its own labelled row and explains the coverage gap and how to close it', async () => {
    routes['/attribution'] = () => json(attribution);
    render(<SpendBreakdownPanel projectId="" />);
    await waitFor(() => expect(screen.getAllByTestId('attribution-row')).toHaveLength(2));
    expect(screen.getByText('Not attributed')).toBeInTheDocument();
    expect(screen.getByTestId('coverage-note')).toHaveTextContent('73% of spend is attributed');
    expect(screen.getByTestId('coverage-note')).toHaveTextContent('not spread across the others');
    fireEvent.click(screen.getByRole('button', { name: 'How to attribute it' }));
    expect(screen.getByText('X-SpendGuard-Application')).toBeInTheDocument();
    expect(screen.getByText(/wins over a header/)).toBeInTheDocument();
  });

  it('asks the backend for the chosen dimension, range and project scope', async () => {
    routes['/attribution'] = () => json({ ...attribution, rows: [], coverage: { attributedShare: null, unattributedUsd: 0, note: null } });
    render(<SpendBreakdownPanel projectId="p 1" />);
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].url).toContain('projectId=p%201');
    expect(calls[0].url).toContain('dimension=model');
    fireEvent.click(screen.getByRole('button', { name: 'Team' }));
    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    await waitFor(() => expect(calls.at(-1)!.url).toContain('dimension=team&days=90'));
  });
});

const rec = (over: Record<string, unknown> = {}) => ({
  id: 'r1', type: 'MODEL_EVALUATION', status: 'OPEN', severity: 'info', projectName: 'Support', title: 'Consider evaluating gpt-4o-mini for gpt-4o traffic',
  summary: 'Re-pricing would have cost $4–$6. This compares cost only.', evidence: { days: 30, comparison: { eligible: true } }, method: 'Historical token totals re-priced at the candidate prices.',
  impact: { lowUsd: 80, highUsd: 120, basis: 'per month, if quality were acceptable (cost-only estimate)' }, confidence: 'low',
  action: 'Run an offline quality evaluation first.', requiresApproval: true, lastSeenAt: '2026-11-25T00:00:00Z', decidedAt: null, decisionNote: null, ...over,
});

describe('Recommendations', () => {
  beforeEach(() => {
    routes['/model-comparison'] = () => json({ range: { days: 30 }, sources: [], disclaimer: 'This compares cost only.', notAssessed: ['output quality'], gatewayLimitations: [] });
  });

  it('shows the evidence, calculation, impact WITH its basis, confidence and the suggested action', async () => {
    routes['/recommendations'] = () => json({ recommendations: [rec()] });
    render(<RecommendationsPanel projectId="" />);
    await waitFor(() => expect(screen.getByTestId('recommendation')).toBeInTheDocument());
    expect(screen.getByTestId('impact')).toHaveTextContent('$80.00–$120.00 per month, if quality were acceptable (cost-only estimate)');
    expect(screen.getByText('Confidence: low')).toBeInTheDocument();
    expect(screen.getByText('Needs approval')).toBeInTheDocument();
    expect(screen.getByText(/Run an offline quality evaluation first/)).toBeInTheDocument();
    expect(screen.getByText('Evidence and calculation')).toBeInTheDocument();
    expect(screen.getByText(/Historical token totals re-priced/)).toBeInTheDocument();
  });

  it('a MEMBER cannot approve (the button is disabled and says why); an ADMIN can', async () => {
    routes['/recommendations'] = () => json({ recommendations: [rec()] });
    localStorage.setItem('spendguard_user', JSON.stringify({ name: 'Mo', orgName: 'Acme', role: 'MEMBER' }));
    render(<RecommendationsPanel projectId="" />);
    const btn = await screen.findByRole('button', { name: 'Approve evaluation' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Only an owner or admin can approve');
    expect(screen.queryByRole('button', { name: /Re-evaluate now/ })).toBeNull();
    cleanup();

    localStorage.setItem('spendguard_user', JSON.stringify({ name: 'Al', orgName: 'Acme', role: 'ADMIN' }));
    render(<RecommendationsPanel projectId="" />);
    expect(await screen.findByRole('button', { name: 'Approve evaluation' })).toBeEnabled();
  });

  it('approval asks for confirmation that spells out that nothing is changed, then records the decision', async () => {
    let status = 'OPEN';
    routes['/recommendations/r1'] = (init) => {
      if (init?.method === 'PATCH') status = 'APPROVED_FOR_EVALUATION';
      return json({ id: 'r1', status });
    };
    routes['/recommendations?'] = () => json({ recommendations: [rec({ status })] });
    render(<RecommendationsPanel projectId="" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve evaluation' }));
    expect(await screen.findByText(/SpendGuard will not change any model, key or project setting/)).toBeInTheDocument();
    expect(screen.getByText(/Quality, latency and behaviour have not been assessed/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false); // nothing is sent until confirmed
    fireEvent.click(screen.getByRole('button', { name: 'Record approval' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toContain('/api/v1/insights/recommendations/r1');
    expect(patch.body).toMatchObject({ action: 'approve_evaluation' });
  });

  it('findings that need no approval offer no approve button', async () => {
    routes['/recommendations'] = () => json({ recommendations: [rec({ type: 'SPEND_INCREASE', requiresApproval: false, title: 'Spend is up', severity: 'critical' })] });
    render(<RecommendationsPanel projectId="" />);
    await screen.findByText('Spend is up');
    expect(screen.queryByRole('button', { name: 'Approve evaluation' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeInTheDocument();
  });

  it('an already-decided finding shows who/when/note instead of action buttons', async () => {
    routes['/recommendations'] = () => json({ recommendations: [rec({ status: 'APPROVED_FOR_EVALUATION', decidedAt: '2026-11-25T10:00:00Z', decisionNote: 'Evaluate on our prompts' })] });
    render(<RecommendationsPanel projectId="" />);
    await screen.findByText(/Evaluate on our prompts/);
    expect(screen.queryByRole('button', { name: 'Approve evaluation' })).toBeNull();
  });

  it('an empty list explains when findings appear', async () => {
    routes['/recommendations'] = () => json({ recommendations: [] });
    render(<RecommendationsPanel projectId="" />);
    await waitFor(() => expect(screen.getByText('Nothing to act on right now')).toBeInTheDocument());
  });
});

describe('Model comparison', () => {
  it('always states "cost only / quality not assessed" and shows ranges, not single numbers', async () => {
    routes['/model-comparison'] = () =>
      json({
        range: { days: 30 },
        disclaimer: 'This compares cost only. Output quality, latency and behaviour are not assessed.',
        notAssessed: ['output quality', 'latency'],
        gatewayLimitations: ['The gateway currently supports text chat completions only.'],
        sources: [
          {
            usage: { model: 'gpt-4o', provider: 'OPENAI', requests: 100, actualCostUsd: 50 },
            distribution: { input: { avg: 4000, p95: 4000, max: 4000 }, output: { avg: 500, p95: 500, max: 500 } },
            comparisons: [
              { candidate: { model: 'gpt-4o-mini', provider: 'OPENAI' }, hypotheticalUsd: { low: 0.09, high: 0.09 }, savingsUsd: { low: 49.91, high: 49.91 }, savingsPercent: { low: 99, high: 99 }, assumptions: ['Uses the historical token counts unchanged.'], checks: [{ id: 'context_window', status: 'pass', detail: 'fits' }, { id: 'provider_key', status: 'pass', detail: 'ok' }, { id: 'lifecycle', status: 'pass', detail: 'ok' }], eligible: true },
              { candidate: { model: 'claude-sonnet-5-5', provider: 'ANTHROPIC' }, hypotheticalUsd: { low: 90, high: 102 }, savingsUsd: { low: -52, high: -40 }, savingsPercent: { low: null, high: null }, assumptions: ['High end applies Anthropic’s documented ~30% tokenizer difference.'], checks: [{ id: 'provider_key', status: 'warn', detail: 'No Anthropic key' }], eligible: true },
            ],
          },
        ],
      });
    render(<ModelComparisonPanel projectId="" />);
    await waitFor(() => expect(screen.getByTestId('comparison-source')).toBeInTheDocument());
    expect(screen.getByText('Cost only. Quality is not assessed.')).toBeInTheDocument();
    expect(screen.getByText(/Output quality, latency and behaviour are not assessed/)).toBeInTheDocument();
    expect(screen.getByText('$90.00 – $102.00')).toBeInTheDocument(); // a RANGE
    expect(screen.getByText('provider key: warn')).toBeInTheDocument(); // a compatibility concern is visible
    expect(screen.getByText(/Not assessed: output quality, latency/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/equivalent|as good as|drop-in/i);
  });
});

describe('formatting helpers', () => {
  it('money uses the precision that matters and never shows NaN', () => {
    expect(usd(1234.5)).toBe('$1,235');
    expect(usd(12.345)).toBe('$12.35');
    expect(usd(0.0912)).toBe('$0.0912');
    expect(usd(0)).toBe('$0.00');
    expect(usd(null)).toBe('—');
    expect(usd(Number.NaN)).toBe('—');
    expect(signedUsd(-5)).toBe('−$5.00');
    expect(signedUsd(5)).toBe('+$5.00');
  });
  it('impact is always a range or a figure WITH its basis, never a bare number', () => {
    expect(impactText({ lowUsd: 10, highUsd: 10, basis: 'observed excess over the last 7 days (not a prediction)' })).toBe('$10.00 observed excess over the last 7 days (not a prediction)');
    expect(impactText({ lowUsd: 10, highUsd: 20, basis: 'per month' })).toBe('$10.00–$20.00 per month');
    expect(impactText({ lowUsd: 8, highUsd: 120, basis: null })).toBe('$8.00–$120.00'); // one precision for both ends
    expect(impactText(null)).toBeNull();
  });
  it('evidence is bounded so a huge payload cannot flood the page', () => {
    expect(evidenceText({ x: 'y'.repeat(10_000) }).length).toBeLessThan(6100);
    expect(evidenceText({ a: 1 })).toContain('"a": 1');
  });
});
