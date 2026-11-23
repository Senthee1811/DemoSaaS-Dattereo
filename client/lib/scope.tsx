'use client';

import React, { createContext, useContext, useMemo } from 'react';

/**
 * The global project scope: ONE value, written only by the top-bar Scope dropdown, read by every
 * project-scoped section (Overview, Projects, Test Bench, Alerts, Audit, Notifications, SDK, Key Vault).
 * No section keeps its own "current project": that is what let Notifications test-alert the wrong
 * project while the Scope said another.
 *
 * '' means "All projects". The id is validated against the project list, so a project that no
 * longer exists falls back to All instead of leaving sections pointing at nothing.
 */
export interface ScopeProject {
  id: string;
  name: string;
}

interface ScopeValue {
  /** The selected project id, or '' for All projects. Always a project that exists. */
  scopeId: string;
  setScopeId: (id: string) => void;
  projects: ScopeProject[];
}

const ScopeContext = createContext<ScopeValue | null>(null);

export function ScopeProvider({
  scopeId,
  onScopeChange,
  projects,
  children,
}: {
  /** The raw selection, owned by the one component that renders this provider. */
  scopeId: string;
  onScopeChange: (id: string) => void;
  projects: ScopeProject[];
  children: React.ReactNode;
}) {
  const value = useMemo<ScopeValue>(
    () => ({
      scopeId: projects.some((p) => p.id === scopeId) ? scopeId : '',
      setScopeId: onScopeChange,
      projects,
    }),
    [scopeId, onScopeChange, projects],
  );
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope(): ScopeValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScope must be used inside <ScopeProvider> (the dashboard provides it)');
  return ctx;
}

/**
 * The project an action should target. With a project in scope it is that project; with
 * "All projects" a single-project action (send a request, a test alert, a webhook) needs a concrete
 * project, so it falls back to the first one and says so (`isFallback`). Derived, never stored.
 */
export function resolveScopeProject<P extends ScopeProject>(projects: P[], scopeId: string): P | null {
  return projects.find((p) => p.id === scopeId) ?? projects[0] ?? null;
}

export function useScopeProject() {
  const { scopeId, projects, setScopeId } = useScope();
  const project = resolveScopeProject(projects, scopeId);
  return { project, projectId: project?.id ?? '', isFallback: scopeId === '' && projects.length > 0, scopeId, setScopeId, projects };
}
