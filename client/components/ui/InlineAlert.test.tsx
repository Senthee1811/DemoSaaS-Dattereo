/**
 * 11.1: the warning banner. The session-expired notice bent out of line because the icon could be
 * squeezed by wrapped text and sat on a 1px nudge. These pin the structure that keeps it aligned,
 * and that the login page's notices use this one shared component rather than hand-built boxes.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { InlineAlert } from './feedback';

describe('InlineAlert (the one banner)', () => {
  it('keeps the icon one line tall, on the first line, and never squeezed by long text', () => {
    render(
      <InlineAlert variant="warning" title="Your session expired. Please sign in again.">
        A second, much longer line of explanation that wraps onto several lines on a narrow screen so the icon has to stay put.
      </InlineAlert>,
    );
    const banner = screen.getByRole('alert');
    const icon = banner.querySelector('svg')!;
    const cls = icon.getAttribute('class') ?? '';
    expect(cls).toContain('shrink-0');
    expect(cls).toContain('h-4');
    expect(cls).not.toMatch(/\bmt-/); // no ad-hoc nudge
    // the title shares the icon's one-line height, so they line up
    expect(screen.getByText('Your session expired. Please sign in again.').className).toContain('leading-4');
    expect(banner.className).toContain('items-start');
    expect(banner.className).toContain('p-3.5');
  });

  it('works with a title only (the session notices)', () => {
    render(<InlineAlert variant="warning" title="Your session expired. Please sign in again." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Your session expired');
  });

  it.each(['app/login/page.tsx', 'app/register/page.tsx', 'app/forgot-password/page.tsx'])(
    '%s has no hand-built alert box left',
    (file) => {
      const src = readFileSync(join(__dirname, '..', '..', file), 'utf8');
      expect(src).not.toMatch(/bg-(critical|warning)-bg[^"]*border-(critical|warning)-border[^"]*flex items-start/);
      expect(src).toContain('InlineAlert');
    },
  );
});
