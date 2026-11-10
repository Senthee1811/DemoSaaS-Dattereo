import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.API_URL || 'http://localhost:4000';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const model = searchParams.get('model');
    const provider = searchParams.get('provider');
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const anomalyOnly = searchParams.get('anomalyOnly');
    const blockedOnly = searchParams.get('blockedOnly');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    if (model) params.set('model', model);
    if (provider) params.set('provider', provider);
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (anomalyOnly) params.set('anomalyOnly', anomalyOnly);
    if (blockedOnly) params.set('blockedOnly', blockedOnly);
    if (limit) params.set('limit', limit);
    if (offset) params.set('offset', offset);

    const qs = params.toString();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const auth = req.headers.get('authorization');
    if (auth) headers['Authorization'] = auth;

    const response = await fetch(`${BACKEND_URL}/api/v1/audit${qs ? '?' + qs : ''}`, {
      headers,
      cache: 'no-store',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Backend error' }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Audit proxy error:', err.message);
    return NextResponse.json({ logs: [], total: 0 });
  }
}
