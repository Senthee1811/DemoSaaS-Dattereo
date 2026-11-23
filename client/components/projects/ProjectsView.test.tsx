/** 7.3: freezing is labelled, confirmed in the shared dialog, and the state is shown in words. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ProjectsView, type ProjectItem } from './ProjectsView';
import { ScopeProvider } from '@/lib/scope';

/** The view reads the global Scope, so tests render it inside the provider (All projects by default). */
function renderView(projects: ProjectItem[], onRefresh: () => void = () => {}, scopeId = '') {
  return render(
    <ScopeProvider scopeId={scopeId} onScopeChange={() => {}} projects={projects.map((p) => ({ id: p.id, name: p.name }))}>
      <ProjectsView projects={projects} onRefresh={onRefresh} />
    </ScopeProvider>,
  );
}

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
    renderView([project()], onRefresh);

    const freeze = screen.getByRole('button', { name: 'Freeze Support Bot (blocks all gateway requests)' });
    expect(freeze).toHaveTextContent('Freeze');
    expect(freeze).toHaveAttribute('title', 'Freeze project (blocks all gateway requests)');

    await act(async () => fireEvent.click(freeze));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent(/HTTP 429/);
    expect(calls).toHaveLength(0);

    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Freeze project' })));
    expect(calls).toEqual([{ method: 'PATCH', body: expect.objectContaining({ id: project().id, isBlocked: true }) }]);
    expect(onRefresh).toHaveBeenCalled();
  });

  it('a frozen project says "Frozen" in words and offers Unfreeze', () => {
    renderView([project({ isBlocked: true, blockReason: 'Manual Emergency Hard-Block enforced by Administrator' })]);
    expect(screen.getByText('Frozen')).toBeInTheDocument();
    const unfreeze = screen.getByRole('button', { name: 'Unfreeze Support Bot (resume gateway requests)' });
    expect(unfreeze).toHaveAttribute('title', 'Unfreeze project (resume gateway requests)');
  });

  it('an automatic budget block is labelled as such, not as a manual freeze', () => {
    renderView([project({ isBlocked: true, blockReason: 'Budget Cap Exceeded: $100.00 limit reached' })]);
    expect(screen.getByText('Budget cap reached')).toBeInTheDocument();
  });

  it('unfreezing also asks first, titled "Unfreeze Project — name", and says it resumes requests immediately', async () => {
    renderView([project({ isBlocked: true })]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Unfreeze Support Bot/ })));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Unfreeze Project — Support Bot');
    expect(dialog).toHaveTextContent('Resumes gateway requests immediately.');
    expect(calls).toHaveLength(0); // nothing sent until confirmed

    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Unfreeze project' })));
    expect(calls[0]).toEqual({ method: 'PATCH', body: expect.objectContaining({ isBlocked: false }) });
  });

  it('the freeze dialog is titled "Freeze Project — name" and states the consequence', async () => {
    renderView([project()]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Freeze Support Bot/ })));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Freeze Project — Support Bot');
    expect(dialog).toHaveTextContent('Blocks all gateway requests for this project until unfrozen.');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('a failed request keeps the dialog open and shows the real error (nothing claims success)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Project not found' } }), { status: 404, headers: { 'Content-Type': 'application/json' } })));
    const onRefresh = vi.fn();
    renderView([project()], onRefresh);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Freeze Support Bot/ })));
    await act(async () => fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Freeze project' })));

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Project not found');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('with a project in Scope, only that project is listed', () => {
    const a = project({ id: 'a-id', name: 'Alpha' });
    const b = project({ id: 'b-id', name: 'Beta' });
    renderView([a, b], () => {}, 'b-id');
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).toBeNull();
  });
});
