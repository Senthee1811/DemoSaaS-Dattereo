/**
 * Phase 12 regressions: the checklist must (12.1) only hide its body when collapsed, never itself,
 * and (12.2) go away once every task is complete, and stay away after a reload.
 * "Reload" = unmount + mount again with the same localStorage: every bit of React state is lost.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OnboardingChecklist, checklistStorageKey } from './OnboardingChecklist';

const nav = { onNavigateToProjects: vi.fn(), onNavigateToKeys: vi.fn(), onNavigateToPlayground: vi.fn() };
const partial = { projectsCount: 1, hasProviderKeys: true, hasGatewayKeys: false, totalRequests: 0 };
const complete = { projectsCount: 1, hasProviderKeys: true, hasGatewayKeys: true, totalRequests: 3 };

const TITLE = 'FinOps Activation Checklist';
const body = () => screen.queryByText(/Connect an AI provider key/);
const toggle = () => screen.getByRole('button', { name: /(Collapse|Expand) checklist/ });

beforeEach(() => localStorage.setItem('spendguard_user', JSON.stringify({ id: 'u1', orgId: 'o1' })));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('12.1 collapse hides the body, never the checklist', () => {
  it('collapse keeps the header and an expand button; expand brings the items back; no refresh needed', () => {
    render(<OnboardingChecklist {...partial} {...nav} />);
    expect(body()).toBeInTheDocument();

    fireEvent.click(toggle()); // collapse
    expect(screen.getByText(TITLE)).toBeInTheDocument(); // header still there
    expect(body()).toBeNull(); // body gone
    expect(toggle()).toHaveAccessibleName('Expand checklist');
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle()); // expand again
    expect(body()).toBeInTheDocument();
    expect(screen.getByText('3 of 5 completed (60%)')).toBeInTheDocument(); // items/progress still right
    expect(toggle()).toHaveAccessibleName('Collapse checklist');
  });

  it('collapsed state is remembered per user across a reload', () => {
    const first = render(<OnboardingChecklist {...partial} {...nav} />);
    fireEvent.click(toggle());
    first.unmount();

    render(<OnboardingChecklist {...partial} {...nav} />);
    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(body()).toBeNull();
    expect(toggle()).toHaveAccessibleName('Expand checklist');
  });

  it('another user on the same browser does not inherit it', () => {
    const first = render(<OnboardingChecklist {...partial} {...nav} />);
    fireEvent.click(toggle());
    first.unmount();

    localStorage.setItem('spendguard_user', JSON.stringify({ id: 'u2', orgId: 'o1' }));
    render(<OnboardingChecklist {...partial} {...nav} />);
    expect(body()).toBeInTheDocument();
  });
});

describe('12.2 a completed checklist goes away and stays away', () => {
  it('is not rendered when every task is complete', () => {
    render(<OnboardingChecklist {...complete} {...nav} />);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('disappears the moment the last task completes, and stays gone after a reload', () => {
    const view = render(<OnboardingChecklist {...partial} {...nav} />);
    expect(screen.getByText(TITLE)).toBeInTheDocument();

    view.rerender(<OnboardingChecklist {...complete} {...nav} />); // last item done
    expect(screen.queryByText(TITLE)).toBeNull();
    view.unmount();

    // Reload while the data is still loading (counts are zero again): it must not flash back.
    render(<OnboardingChecklist projectsCount={0} hasProviderKeys={false} hasGatewayKeys={false} totalRequests={0} {...nav} />);
    expect(screen.queryByText(TITLE)).toBeNull();
    expect(JSON.parse(localStorage.getItem(checklistStorageKey('u1'))!).done).toBe(true);
  });

  it('collapsed AND complete is hidden too (does not stay stuck as a collapsed bar)', () => {
    const view = render(<OnboardingChecklist {...partial} {...nav} />);
    fireEvent.click(toggle()); // collapsed, header visible
    expect(screen.getByText(TITLE)).toBeInTheDocument();

    view.rerender(<OnboardingChecklist {...complete} {...nav} />);
    expect(screen.queryByText(TITLE)).toBeNull();
    view.unmount();

    render(<OnboardingChecklist {...partial} {...nav} />); // reload: still gone, not back as a collapsed bar
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('does not hide while any real signal is still false', () => {
    for (const missing of [
      { ...complete, hasProviderKeys: false },
      { ...complete, projectsCount: 0 },
      { ...complete, hasGatewayKeys: false },
      { ...complete, totalRequests: 0 },
    ]) {
      localStorage.clear();
      localStorage.setItem('spendguard_user', JSON.stringify({ id: 'u1' }));
      const v = render(<OnboardingChecklist {...missing} {...nav} />);
      expect(screen.getByText(TITLE)).toBeInTheDocument();
      v.unmount();
    }
  });
});
