import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

// Verifies the current password server-side and signs out the other sessions.
export async function POST(req: NextRequest) {
  return proxyToBackend(req, { path: '/auth/change-password' });
}
