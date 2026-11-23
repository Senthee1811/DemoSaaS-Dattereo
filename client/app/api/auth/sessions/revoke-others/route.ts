import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

// Signs out every session except the current one.
export async function POST(req: NextRequest) {
  return proxyToBackend(req, { path: '/auth/sessions/revoke-others' });
}
