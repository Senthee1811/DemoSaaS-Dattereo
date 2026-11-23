import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

// Revokes one of the caller's own sessions. The backend checks ownership; the id is encoded, never trusted.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(req, { path: `/auth/sessions/${encodeURIComponent(id)}` });
}
