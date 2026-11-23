/**
 * 7.6 regression: onboarding must not advance with an empty provider key by accident.
 * Skipping is an explicit action, and the result is shown honestly (Not configured).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/onboarding',
  useSearchParams: () => new URLSearchParams(),
}));

import OnboardingPage from './page';
import { KeyVaultView } from '@/components/keys/KeyVaultView';

const PROJECT_ID = '3c66dcd5-9588-479c-ac9d-83c024ad1032';
const posts: Array<{ url: string; body: Record<string, unknown> | undefined }> = [];

function mockApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (init?.method === 'POST') posts.push({ url, body });
      let res: unknown = {};
      if (url.includes('/api/v1/pricing')) res = { data: [], meta: {} };
      else if (url.includes('/api/v1/projects') && init?.method === 'POST') res = { project: { id: PROJECT_ID } };
      else if (url.includes('/api/v1/keys') && body?.type === 'GATEWAY') res = { secret: 'sg_live_test_secret' };
      else if (url.includes('/api/v1/keys')) res = { providerKeys: [], gatewayKeys: [] };
      return new Response(JSON.stringify(res), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

beforeEach(() => {
  posts.length = 0;
  localStorage.setItem('spendguard_token', 'test-token');
  localStorage.setItem('spendguard_user', JSON.stringify({ name: 'Alice', orgName: 'Acme' }));
  mockApi();
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function goToProviderStep() {
  render(<OnboardingPage />);
  await act(async () => fireEvent.click(await screen.findByRole('button', { name: /Next: Connect Provider/i })));
}

describe('7.6 onboarding: provider key', () => {
  it('(a) empty key + Next → blocked with an inline error, nothing sent', async () => {
    await goToProviderStep();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Next: Configure Budget/i })));

    expect(screen.getByRole('alert')).toHaveTextContent(/Enter your OpenAI API key, or choose "Skip for now"/);
    expect(screen.getByLabelText('OpenAI API key')).toHaveAttribute('aria-invalid', 'true');
    // Still on the provider step
    expect(screen.getByRole('button', { name: /Next: Configure Budget/i })).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it('(a) whitespace-only key is treated as empty', async () => {
    await goToProviderStep();
    fireEvent.change(screen.getByLabelText('OpenAI API key'), { target: { value: '   ' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Next: Configure Budget/i })));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('(b) explicit skip → setup completes (project + gateway key) without storing a provider key', async () => {
    await goToProviderStep();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Skip for now/i })));
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: /Generate Gateway Token/i })));

    // A project and a gateway key were created; no provider key was sent
    expect(posts.some((p) => p.url.includes('/api/v1/projects'))).toBe(true);
    expect(posts.some((p) => p.body?.type === 'GATEWAY')).toBe(true);
    expect(posts.some((p) => p.body?.type === 'PROVIDER')).toBe(false);
  });

  it('a real key is stored (trimmed) when entered', async () => {
    await goToProviderStep();
    fireEvent.change(screen.getByLabelText('OpenAI API key'), { target: { value: '  sk-real-key  ' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Next: Configure Budget/i })));
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: /Generate Gateway Token/i })));

    const provider = posts.find((p) => p.body?.type === 'PROVIDER');
    expect(provider?.body).toMatchObject({ provider: 'OPENAI', plainKey: 'sk-real-key', projectId: PROJECT_ID });
  });

  it('(b) Key Vault shows the missing provider key honestly', async () => {
    render(<KeyVaultView projects={[{ id: PROJECT_ID, name: 'Production AI Assistant' }]} />);
    expect(await screen.findByText('Provider key: not configured')).toBeInTheDocument();
  });
});
