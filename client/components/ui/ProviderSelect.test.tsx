import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ProviderSelect } from './ProviderSelect';
import { PROVIDERS, getProvider, providerNames, providerForModel, type ProviderDef } from '@/lib/providers';
import { modelChartColor } from '@/lib/tokens';

async function openList(name = 'Provider') {
  const trigger = screen.getByRole('combobox', { name });
  trigger.focus();
  await act(async () => fireEvent.keyDown(trigger, { key: 'Enter' }));
  return screen.findByRole('listbox');
}

describe('ProviderSelect (9.2)', () => {
  it('lists every provider in the registry, each with its logo and its label', async () => {
    render(<ProviderSelect value="OPENAI" onValueChange={() => {}} />);
    const list = await openList();

    const options = within(list).getAllByRole('option');
    // The label is the bold span; the logo (an svg) sits before it on the same line
    expect(options.map((o) => o.querySelector('span.font-medium')?.textContent)).toEqual(['OpenAI', 'Anthropic', 'Gemini', 'Groq']);
    for (const option of options) {
      expect(option.querySelector('svg')).not.toBeNull(); // a logo beside every label
    }
  });

  it('selecting an option reports the backend enum id (no translation layer)', async () => {
    const onValueChange = vi.fn();
    render(<ProviderSelect value="OPENAI" onValueChange={onValueChange} />);
    await openList();
    await act(async () => fireEvent.click(screen.getByRole('option', { name: /Groq/ })));
    expect(onValueChange).toHaveBeenCalledWith('GROQ');
  });

  it('the trigger shows the selected provider with its logo', () => {
    render(<ProviderSelect value="GEMINI" onValueChange={() => {}} />);
    const trigger = screen.getByRole('combobox', { name: 'Provider' });
    expect(trigger).toHaveTextContent('Gemini');
    expect(trigger.querySelector('svg')).not.toBeNull();
  });

  it('allowAll adds an "All providers" option that reports an empty value', async () => {
    const onValueChange = vi.fn();
    render(<ProviderSelect value="OPENAI" onValueChange={onValueChange} allowAll />);
    await openList();
    await act(async () => fireEvent.click(screen.getByRole('option', { name: 'All providers' })));
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('the list is scrollable and capped to the available height (it does not assume four items)', async () => {
    render(<ProviderSelect value="OPENAI" onValueChange={() => {}} />);
    const list = await openList();
    const viewport = list.querySelector('[data-radix-select-viewport]') as HTMLElement;
    expect(viewport).not.toBeNull();
    expect(viewport.className).toContain('overflow-y-auto');
    expect(viewport.className).toContain('max-h-[var(--radix-select-content-available-height)]');
  });
});

describe('9.4 / expansion: adding a fifth provider to the registry array ALONE is enough', () => {
  const fake: ProviderDef = { id: 'FAKECO', label: 'FakeCo', desc: 'Test provider', keyPlaceholder: 'fk_...', modelPattern: /^fakeco-/ };

  afterEach(() => {
    const list = PROVIDERS as unknown as ProviderDef[];
    const i = list.findIndex((p) => p.id === fake.id);
    if (i >= 0) list.splice(i, 1);
  });

  it('the new entry appears in the dropdown, with a logo and its label, and no other file is touched', async () => {
    (PROVIDERS as unknown as ProviderDef[]).push(fake); // the one-line change under test

    render(<ProviderSelect value="OPENAI" onValueChange={() => {}} />);
    const list = await openList();
    const options = within(list).getAllByRole('option');

    expect(options).toHaveLength(5);
    const added = within(list).getByRole('option', { name: /FakeCo/ });
    expect(added.querySelector('svg')).not.toBeNull(); // monogram, since it has no icon
    expect(added.querySelector('text')?.textContent).toBe('F');
  });

  it('everything else that reads the registry picks it up too (labels, copy, model colours, lookups)', () => {
    (PROVIDERS as unknown as ProviderDef[]).push(fake);

    expect(getProvider('fakeco')?.label).toBe('FakeCo');
    expect(providerNames()).toBe('OpenAI, Anthropic, Gemini, Groq and FakeCo'); // copy follows
    expect(providerForModel('fakeco-large')?.id).toBe('FAKECO');
    expect(modelChartColor('fakeco-large')).toBe('#71717A'); // neutral grey: no shades declared, no crash
  });

  it('after removal the dropdown is back to four', async () => {
    render(<ProviderSelect value="OPENAI" onValueChange={() => {}} />);
    const list = await openList();
    expect(within(list).getAllByRole('option')).toHaveLength(4);
  });
});
