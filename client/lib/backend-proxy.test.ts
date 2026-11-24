import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxyToBackend } from './backend-proxy';

afterEach(() => vi.unstubAllGlobals());

function stubBackend(responseHeaders: Record<string, string> = {}) {
  const inits: RequestInit[] = [];
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    inits.push(init);
    return new Response('{}', { status: 200, headers: responseHeaders });
  });
  return inits;
}
const sent = (inits: RequestInit[]) => inits[0].headers as Headers;

describe('gateway proxy: attribution headers', () => {
  it('forwards the three attribution headers verbatim so the backend can validate and record them', async () => {
    const m = stubBackend();
    const req = new NextRequest('http://localhost/api/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer t', 'content-type': 'application/json', 'x-spendguard-application': 'Pricing-Page', 'x-spendguard-team': 'Growth', 'x-spendguard-tags': 'env=staging' },
      body: '{}',
    });
    await proxyToBackend(req, { path: '/v1/chat/completions' });
    const h = sent(m);
    expect(h.get('x-spendguard-application')).toBe('Pricing-Page'); // not normalised or interpreted here
    expect(h.get('x-spendguard-team')).toBe('Growth');
    expect(h.get('x-spendguard-tags')).toBe('env=staging');
  });

  it('does not forward arbitrary headers, including look-alike spendguard headers that could confuse the backend', async () => {
    const m = stubBackend();
    const req = new NextRequest('http://localhost/api/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer t', 'x-spendguard-org-id': 'org-victim', 'x-spendguard-user-id': 'u-victim', 'x-internal-secret': 'x', cookie: 'session=abc', 'x-forwarded-host': 'evil.example' },
      body: '{}',
    });
    await proxyToBackend(req, { path: '/v1/chat/completions' });
    const h = sent(m);
    for (const name of ['x-spendguard-org-id', 'x-spendguard-user-id', 'x-internal-secret', 'cookie', 'x-forwarded-host']) expect(h.get(name)).toBeNull();
  });

  it('sends no attribution headers when the browser sent none (nothing is invented client-side)', async () => {
    const m = stubBackend();
    await proxyToBackend(new NextRequest('http://localhost/api/v1/chat/completions', { method: 'POST', headers: { authorization: 'Bearer t' }, body: '{}' }), { path: '/v1/chat/completions' });
    const h = sent(m);
    expect(h.get('x-spendguard-application')).toBeNull();
    expect(h.get('x-spendguard-team')).toBeNull();
    expect(h.get('x-spendguard-tags')).toBeNull();
  });

  it('passes the "attribution ignored" notice back so a caller can see why a header was not used', async () => {
    stubBackend({ 'x-spendguard-attribution-ignored': 'team header ignored: the gateway key is assigned to "platform"', 'set-cookie': 'a=b' });
    const res = await proxyToBackend(new NextRequest('http://localhost/api/v1/chat/completions', { method: 'POST', body: '{}' }), { path: '/v1/chat/completions' });
    expect(res.headers.get('x-spendguard-attribution-ignored')).toMatch(/team header ignored/);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
