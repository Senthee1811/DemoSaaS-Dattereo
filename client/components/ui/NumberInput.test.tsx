import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { NumberInput } from './NumberInput';
import { BUDGET_USD, RATE_LIMIT_RPM, numberProblem } from '@/lib/limits';

function Harness({ initial, range, step }: { initial: string; range: typeof BUDGET_USD; step?: number }) {
  const [v, setV] = useState(initial);
  return <NumberInput value={v} onValueChange={setV} range={range} step={step} aria-label="amount" />;
}

describe('NumberInput (7.7)', () => {
  it('shows why an out-of-range value is rejected, without silently clamping it', () => {
    render(<Harness initial="1000" range={BUDGET_USD} />);
    const input = screen.getByLabelText('amount');
    fireEvent.change(input, { target: { value: '100000000' } });
    expect(input).toHaveValue('100000000'); // not clamped
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Must be between 0.0001 and 99,999,999.');
  });

  it('steppers move by the step and stay inside the server range', () => {
    render(<Harness initial="1" range={RATE_LIMIT_RPM} step={60} />);
    const input = screen.getByLabelText('amount');
    fireEvent.click(screen.getByRole('button', { name: 'Increase' }));
    expect(input).toHaveValue('61');
    fireEvent.click(screen.getByRole('button', { name: 'Decrease' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decrease' }));
    expect(input).toHaveValue('1'); // floor is the server minimum, not 0 or negative
    expect(screen.getByRole('button', { name: 'Decrease' })).toBeDisabled();
  });

  it('arrow keys step too', () => {
    const onValueChange = vi.fn();
    render(<NumberInput value="99999998" onValueChange={onValueChange} range={BUDGET_USD} step={100} aria-label="b" />);
    fireEvent.keyDown(screen.getByLabelText('b'), { key: 'ArrowUp' });
    expect(onValueChange).toHaveBeenCalledWith('99999999');
  });

  it('ranges mirror the server DTO limits', () => {
    expect(numberProblem('0.0001', BUDGET_USD)).toBeNull();
    expect(numberProblem('0', BUDGET_USD)).not.toBeNull();
    expect(numberProblem('-5', RATE_LIMIT_RPM)).not.toBeNull();
    expect(numberProblem('1.5', RATE_LIMIT_RPM)).toBe('Enter a whole number.');
    expect(numberProblem('100000', RATE_LIMIT_RPM)).toBeNull();
    expect(numberProblem('100001', RATE_LIMIT_RPM)).not.toBeNull();
  });
});
