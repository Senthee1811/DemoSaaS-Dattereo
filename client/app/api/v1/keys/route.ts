import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

// Forwards to the NestJS backend (/api/v1/keys); auth headers and status codes pass through.
export async function GET(req: NextRequest) {
  return proxyToBackend(req, { path: '/api/v1/keys' });
}

export async function POST(req: NextRequest) {
  return proxyToBackend(req, { path: '/api/v1/keys' });
}

export async function DELETE(req: NextRequest) {
  return proxyToBackend(req, { path: '/api/v1/keys' });
}
