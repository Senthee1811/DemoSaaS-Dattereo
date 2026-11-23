import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

// Real security facts for the signed-in user. Auth headers and status codes pass through.
export async function GET(req: NextRequest) {
  return proxyToBackend(req, { path: '/auth/security' });
}
