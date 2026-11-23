import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

// Sign-out: the backend revokes the refresh token. Status codes pass through.
export async function POST(req: NextRequest) {
  return proxyToBackend(req, { path: '/auth/logout' });
}
