/**
 * 10.7: every dashboard chart drills down into the same /api/v1/audit-backed panel.
 * Recharts draws nothing in jsdom (no layout), so this drives the DOM entry points that share the
 * chart's handlers: the spend-by-model legend rows and the day picker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { OverviewCharts } from './OverviewCharts';
import { ScopeProvider } from '@/lib/scope';

const calls: string[] = [];
const ROW = { id: 'r1', projectName: 'Ai Chatbot', provider: 'GROQ', model: 'openai/gpt-oss-120b', totalTokens: 1600, costEstimate: 0.0004, statusCode: 200, isBlocked: false, isAnomaly: false, timestamp: '2026-11-20T13:45:09.000Z' };

beforeEach(() => {
  calls.length = 0;
  localStorage.setItem('spendguard_token', 't');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ logs: [ROW], total: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const render_ = (scopeId = '') =>
  render(
    <ScopeProvider scopeId={scopeId} onScopeChange={() => {}} projects={[{ id: 'p-ai', name: 'Ai Chatbot' }]}>
      <OverviewCharts
        dailySpend={[
          { date: '2026-11-19', spend: 0.0001, tokens: 100, requests: 1 },
          { date: '2026-11-20', spend: 0.0004, tokens: 1600, requests: 1 },
        ]}
        pieData={[
          { name: 'openai/gpt-oss-120b', provider: 'GROQ', value: 0.0004, color: '#7C3AED' },
          { name: 'gpt-4o-mini', provider: 'OPENAI', value: 0.0001, color: '#FF6B35' },
        ]}
        totalSpend={0.0005}
        onNavigateToPlayground={() => {}}
      />
    </ScopeProvider>,
  );

describe('10.7 both charts open the same drill-down', () => {
  it('spend-by-model: a model row opens that model\'s requests (audit?model=...)', async () => {
    render_();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Show requests for openai/gpt-oss-120b' })));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Ai Chatbot')).toBeInTheDocument();
    const url = new URL(calls.at(-1)!, 'http://localhost');
    expect(url.pathname).toBe('/api/v1/audit');
    expect(url.searchParams.get('model')).toBe('openai/gpt-oss-120b');
    expect(url.searchParams.get('limit')).toBe('100');
  });

  it('spend-over-time: a day opens that UTC day\'s requests (audit?startDate&endDate)', async () => {
    render_();
    await act(async () => fireEvent.change(screen.getByLabelText('Inspect the requests of a day'), { target: { value: '2026-11-20' } }));

    await screen.findByRole('dialog');
    const url = new URL(calls.at(-1)!, 'http://localhost');
    expect(url.pathname).toBe('/api/v1/audit');
    expect(url.searchParams.get('startDate')).toBe('2026-11-20T00:00:00.000Z');
    expect(url.searchParams.get('endDate')).toBe('2026-11-20T23:59:59.999Z');
  });

  it('with a project in Scope, both drill-downs are narrowed to that project', async () => {
    render_('p-ai');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Show requests for gpt-4o-mini' })));
    await screen.findByRole('dialog');
    expect(new URL(calls.at(-1)!, 'http://localhost').searchParams.get('projectId')).toBe('p-ai');
  });

  it('Escape closes the panel and the chart is usable again', async () => {
    render_();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Show requests for gpt-4o-mini' })));
    await screen.findByRole('dialog');
    await act(async () => fireEvent.keyDown(window, { key: 'Escape' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
