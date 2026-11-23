/**
 * 11.5: both dashboard charts NAVIGATE to the one detailed-usage route (no modal).
 * Recharts draws nothing in jsdom (no layout), so this drives the DOM entry points that share the
 * chart's handlers: the cost-by-model legend rows and the day picker.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { OverviewCharts } from './OverviewCharts';
import { ScopeProvider } from '@/lib/scope';

const AI = '22222222-2222-4222-8222-222222222222';

beforeEach(() => push.mockClear());

const render_ = (scopeId = '') =>
  render(
    <ScopeProvider scopeId={scopeId} onScopeChange={() => {}} projects={[{ id: AI, name: 'Ai Chatbot' }]}>
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

describe('11.5 both charts navigate to the same detail route', () => {
  it('cost-by-model: a model goes to /projects/all/usage?metric=model&model=...', () => {
    render_();
    fireEvent.click(screen.getByRole('button', { name: 'Show requests for openai/gpt-oss-120b' }));
    expect(push).toHaveBeenCalledTimes(1);
    const url = new URL(push.mock.calls[0][0], 'http://localhost');
    expect(url.pathname).toBe('/projects/all/usage');
    expect(url.searchParams.get('metric')).toBe('model');
    expect(url.searchParams.get('model')).toBe('openai/gpt-oss-120b');
  });

  it('spend-over-time: a day goes to the same route with metric=daily&range=<UTC day>', () => {
    render_();
    fireEvent.change(screen.getByLabelText('Inspect the requests of a day'), { target: { value: '2026-11-20' } });
    const url = new URL(push.mock.calls[0][0], 'http://localhost');
    expect(url.pathname).toBe('/projects/all/usage');
    expect(url.searchParams.get('metric')).toBe('daily');
    expect(url.searchParams.get('range')).toBe('2026-11-20');
  });

  it('the project in the URL is the global Scope, for both charts', () => {
    render_(AI);
    fireEvent.click(screen.getByRole('button', { name: 'Show requests for gpt-4o-mini' }));
    fireEvent.change(screen.getByLabelText('Inspect the requests of a day'), { target: { value: '2026-11-19' } });
    expect(push.mock.calls.map((c) => new URL(c[0], 'http://localhost').pathname)).toEqual([
      `/projects/${AI}/usage`,
      `/projects/${AI}/usage`,
    ]);
  });

  it('does not open any dialog or panel', () => {
    render_();
    fireEvent.click(screen.getByRole('button', { name: 'Show requests for gpt-4o-mini' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
