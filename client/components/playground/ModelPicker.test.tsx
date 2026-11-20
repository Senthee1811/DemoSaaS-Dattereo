import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ModelPicker } from './ModelPicker';

const row = (over: Record<string, unknown>) => ({
  model: 'x',
  provider: 'OPENAI',
  displayName: 'X',
  inputPricePerMillion: 1,
  outputPricePerMillion: 2,
  cachedInputPrice: null,
  contextWindow: null,
  source: 'manual',
  updatedAt: '2026-11-18T10:00:00.000Z',
  providerStatus: null,
  retiresAt: null,
  ...over,
});

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

afterEach(() => vi.unstubAllGlobals());

describe('ModelPicker', () => {
  it('renders one card per model from the API response, with prices and the pricing date', async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse({
        status: 'success',
        data: [
          row({ model: 'alpha-1', displayName: 'Alpha One', inputPricePerMillion: 2, outputPricePerMillion: 10 }),
          row({ model: 'beta-2', displayName: 'Beta Two', provider: 'GEMINI', inputPricePerMillion: 0.075, outputPricePerMillion: 0.3 }),
        ],
        meta: { pricingUpdatedAt: '2026-11-18T10:00:00.000Z', lastAvailabilityCheckAt: null, priceSource: 'maintained table' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const onLoaded = vi.fn();
    render(<ModelPicker selectedModel="" onSelect={() => {}} onLoaded={onLoaded} />);

    expect(await screen.findByText('Alpha One')).toBeInTheDocument();
    expect(screen.getByText('Beta Two')).toBeInTheDocument();
    expect(screen.getByText('$2.00 in / $10.00 out')).toBeInTheDocument();
    expect(screen.getByText('$0.075 in / $0.30 out')).toBeInTheDocument();
    expect(screen.getByText(/Pricing as of Nov 18, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/not a live provider feed/)).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('/api/v1/pricing');
    expect(onLoaded).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ model: 'alpha-1' })]));
  });

  it('selects a model when its card is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ data: [row({ model: 'alpha-1', displayName: 'Alpha One' })], meta: {} })));
    const onSelect = vi.fn();
    render(<ModelPicker selectedModel="" onSelect={onSelect} />);
    fireEvent.click(await screen.findByText('Alpha One'));
    expect(onSelect).toHaveBeenCalledWith('alpha-1');
  });

  it('shows an error state, and no model cards, when the fetch fails (no stale fallback)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ error: 'down' }, 503)));
    render(<ModelPicker selectedModel="" onSelect={() => {}} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load the model list/i);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    // None of the previously hardcoded models may appear
    expect(screen.queryByText(/GPT-4o/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Claude 3\.5/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Gemini 1\.5/i)).not.toBeInTheDocument();
  });

  it('shows an error state when the network request rejects, and Retry refetches', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementationOnce(() => jsonResponse({ data: [row({ model: 'alpha-1', displayName: 'Alpha One' })], meta: {} }));
    vi.stubGlobal('fetch', fetchMock);

    render(<ModelPicker selectedModel="" onSelect={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('Alpha One')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('flags a model the provider no longer lists', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ data: [row({ displayName: 'Old One', providerStatus: 'missing' })], meta: {} })));
    render(<ModelPicker selectedModel="" onSelect={() => {}} />);
    expect(await screen.findByText(/no longer lists this model/i)).toBeInTheDocument();
  });
});
