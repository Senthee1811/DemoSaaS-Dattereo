import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { LazyBoundary, isChunkLoadError } from './LazyBoundary';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Boom({ error }: { error: Error }): never {
  throw error;
}

describe('isChunkLoadError', () => {
  it.each([
    [Object.assign(new Error('x'), { name: 'ChunkLoadError' }), true],
    [new Error('Loading chunk 123 failed.'), true],
    [new Error('Failed to fetch dynamically imported module: https://x/y.js'), true],
    [new Error('error loading dynamically imported module'), true],
    [new Error('Cannot read properties of undefined'), false],
    [null, false],
  ])('%s → %s', (err, expected) => expect(isChunkLoadError(err)).toBe(expected));
});

describe('LazyBoundary', () => {
  it('renders its children when nothing fails', () => {
    render(<LazyBoundary name="Alerts"><p>fine</p></LazyBoundary>);
    expect(screen.getByText('fine')).toBeInTheDocument();
  });

  it('a failure shows a contained, named message instead of blanking the page, and logs only the error name and message', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <div>
        <nav>shell</nav>
        <LazyBoundary name="Cost Insights"><Boom error={new Error('render failed')} /></LazyBoundary>
      </div>,
    );
    expect(screen.getByText('shell')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Cost Insights could not be loaded');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    const ours = log.mock.calls.find((c) => String(c[0]).includes('[Cost Insights]'));
    expect(ours).toBeDefined();
    expect(JSON.stringify(ours)).not.toMatch(/componentStack|props/);
  });

  it('"Try again" remounts the section for an ordinary error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let fail = true;
    function Flaky() {
      if (fail) throw new Error('once');
      return <p>recovered</p>;
    }
    render(<LazyBoundary name="Team"><Flaky /></LazyBoundary>);
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('a failed DOWNLOAD offers a page reload (a rejected import stays rejected), not a pointless remount', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<LazyBoundary name="Audit"><Boom error={Object.assign(new Error('Loading chunk 9 failed.'), { name: 'ChunkLoadError' })} /></LazyBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent(/failed to download/);
    fireEvent.click(screen.getByRole('button', { name: 'Reload the page' }));
    expect(reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('changing the key (the dashboard keys it by tab) clears a previous failure', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Host() {
      const [tab, setTab] = useState('a');
      return (
        <>
          <button onClick={() => setTab('b')}>go b</button>
          <LazyBoundary key={tab} name={tab}>{tab === 'a' ? <Boom error={new Error('x')} /> : <p>tab b ok</p>}</LazyBoundary>
        </>
      );
    }
    render(<Host />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByText('go b'));
    expect(screen.getByText('tab b ok')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
