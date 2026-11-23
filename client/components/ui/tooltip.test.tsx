import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Tip } from './tooltip';

describe('Tip (10.6)', () => {
  it('names the control when it receives keyboard focus (not hover-only)', async () => {
    render(
      <Tip label="Notifications">
        <button type="button" aria-label="Notifications">
          bell
        </button>
      </Tip>,
    );
    expect(screen.queryByRole('tooltip')).toBeNull();

    const button = screen.getByRole('button', { name: 'Notifications' });
    await act(async () => {
      button.focus();
      fireEvent.focus(button);
    });
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Notifications');
  });

  it('closes on Escape', async () => {
    render(
      <Tip label="Refresh data">
        <button type="button" aria-label="Refresh data">
          r
        </button>
      </Tip>,
    );
    const button = screen.getByRole('button', { name: 'Refresh data' });
    await act(async () => {
      button.focus();
      fireEvent.focus(button);
    });
    await screen.findByRole('tooltip');
    await act(async () => fireEvent.keyDown(button, { key: 'Escape' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
