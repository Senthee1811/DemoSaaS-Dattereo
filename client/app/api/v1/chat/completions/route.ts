import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.API_URL || 'http://localhost:4000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Forward all headers relevant to gateway auth
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const authHeader = req.headers.get('authorization');
    if (authHeader) headers['Authorization'] = authHeader;
    const projectHeader = req.headers.get('x-spendguard-project-id');
    if (projectHeader) headers['x-spendguard-project-id'] = projectHeader;
    const altProjectHeader = req.headers.get('x-project-id');
    if (altProjectHeader) headers['x-project-id'] = altProjectHeader;

    const response = await fetch(`${BACKEND_URL}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();

    const nextResponse = NextResponse.json(data, { status: response.status });

    // Forward governance headers from backend
    const govHeaders = ['X-SpendGuard-Cost', 'X-SpendGuard-Latency', 'X-SpendGuard-Blocked', 'X-Request-Id'];
    for (const h of govHeaders) {
      const val = response.headers.get(h);
      if (val) nextResponse.headers.set(h, val);
    }

    return nextResponse;
  } catch (error: any) {
    console.error('Gateway proxy error:', error.message);
    return NextResponse.json(
      { error: { message: error.message || 'Gateway proxy error', type: 'api_error' } },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-SpendGuard-Project-Id',
    },
  });
}
