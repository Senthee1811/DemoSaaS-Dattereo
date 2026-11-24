import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

// Forwards /api/v1/notifications/* (channels, deliveries, inbox) to the NestJS backend. The backend scopes every
// call to the caller's organization and checks the role; nothing here widens access.
type Ctx = { params: Promise<{ path: string[] }> };
const target = async (ctx: Ctx) => `/api/v1/notifications/${(await ctx.params).path.map(encodeURIComponent).join('/')}`;

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxyToBackend(req, { path: await target(ctx) });
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxyToBackend(req, { path: await target(ctx) });
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxyToBackend(req, { path: await target(ctx) });
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxyToBackend(req, { path: await target(ctx) });
}
