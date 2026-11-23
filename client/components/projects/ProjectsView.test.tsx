/** 7.3: freezing is labelled, confirmed in the shared dialog, and the state is shown in words. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ProjectsView, type ProjectItem } from './ProjectsView';

const project = (over: Partial<ProjectItem> = {}): ProjectItem => ({
  id: '3c66dcd5-9588-479c-ac9d-83c024ad1032',
  name: 'Support Bot',
  slug: 'support-bot',
  budgetMonthly: 100,
  budgetHardBlockEnabled: true,
  isBlocked: false,
  currentMonthlySpend: 5,
  currentWeeklySpend: 1,
  utilizationPct: 5,
  requestCount: 3,
  ...over,
});

const calls: Array<{ method?: string; body: unknown }> = [];
beforeEach(() => {
  calls.length = 0;
  localStorage.setItem('spendguard_token', 't');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Projects: freeze / unfreeze', () => {
  it('the button is labelled and has a tooltip; freezing asks first and sends nothing until confirmed', async () => {
    const onRefresh = vi.fn();
    render(<ProjectsView projects={[project()]} onRefresh={onRefresh} />);

    const freeze = screen.getByRole('button', { name: 'Freeze Support Bot (blocks all gateway requests)' });
    expect(freeze).toHaveTextContent('Freeze');
    expect(freeze).toHaveAttribute('title', 'Freeze project (blocks all gateway requests)');

    await act(async () => fireEvent.click(freeze));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent(/HTTP 429/);
    expect(calls).toHaveLength(0);

    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Freeze traffic' })));
    expect(calls).toEqual([{ method: 'PATCH', body: expect.objectContaining({ id: project().id, isBlocked: true }) }]);
    expect(onRefresh).toHaveBeenCalled();
  });

  it('a frozen project says "Frozen" in words and offers Unfreeze', () => {
    render(<ProjectsView projects={[project({ isBlocked: true, blockReason: 'Manual Emergency Hard-Block enforced by Administrator' })]} onRefresh={() => {}} />);
    expect(screen.getByText('Frozen')).toBeInTheDocument();
    const unfreeze = screen.getByRole('button', { name: 'Unfreeze Support Bot (resume gateway requests)' });
    expect(unfreeze).toHaveAttribute('title', 'Unfreeze project (resume gateway requests)');
  });

  it('an automatic budget block is labelled as such, not as a manual freeze', () => {
    render(<ProjectsView projects={[project({ isBlocked: true, blockReason: 'Budget Cap Exceeded: $100.00 limit reached' })]} onRefresh={() => {}} />);
    expect(screen.getByText('Budget cap reached')).toBeInTheDocument();
  });

  it('unfreezing is direct (no dialog) and sends isBlocked=false', async () => {
    render(<ProjectsView projects={[project({ isBlocked: true })]} onRefresh={() => {}} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Unfreeze Support Bot/ })));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(calls[0]).toEqual({ method: 'PATCH', body: expect.objectContaining({ isBlocked: false }) });
  });
});
