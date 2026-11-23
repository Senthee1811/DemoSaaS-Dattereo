import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProviderBadge, ProviderLogo } from './ProviderLogo';
import { PROVIDERS, providerKeyPlaceholder, providerLabel } from '@/lib/providers';

describe('ProviderLogo / provider registry (8.5)', () => {
  it('the registry has the four providers, ids matching the backend enum, and Groq is labelled exactly "Groq"', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(['OPENAI', 'ANTHROPIC', 'GEMINI', 'GROQ']);
    expect(providerLabel('GROQ')).toBe('Groq');
    expect(providerLabel('groq')).toBe('Groq'); // accepts the lower-case id too
    expect(PROVIDERS.map((p) => p.label)).toEqual(['OpenAI', 'Anthropic', 'Gemini', 'Groq']);
  });

  it('every provider renders a logo through the one component, including Groq', () => {
    for (const { id } of PROVIDERS) {
      const { container, unmount } = render(<ProviderLogo provider={id} />);
      expect(container.querySelector('svg')).not.toBeNull();
      unmount();
    }
  });

  it('Groq has no simple-icons mark, so it shows the plain "G" monogram (not an imitation logo)', () => {
    const { container } = render(<ProviderLogo provider="groq" />);
    expect(container.querySelector('path')).toBeNull();
    expect(container.querySelector('text')?.textContent).toBe('G');
  });

  it('ProviderBadge shows logo + the same label', () => {
    render(<ProviderBadge provider="GROQ" />);
    expect(screen.getByText('Groq')).toBeInTheDocument();
  });

  it('each provider has its own key-format placeholder', () => {
    expect(providerKeyPlaceholder('GROQ')).toBe('gsk_...');
    expect(providerKeyPlaceholder('OPENAI')).toBe('sk-proj-...');
    expect(providerKeyPlaceholder('nope')).toBe('');
  });
});
