import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

// The caller's own security events (paginated via ?limit=&offset=).
export async function GET(req: NextRequest) {
  return proxyToBackend(req, { path: '/auth/security-activity' });
}
