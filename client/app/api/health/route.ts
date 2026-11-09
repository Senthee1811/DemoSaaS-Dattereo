import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.API_URL || 'http://localhost:4000';

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      cache: 'no-store',
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err: any) {
    return NextResponse.json({
      status: 'backend_offline',
      service: 'spendguard-frontend-proxy',
      timestamp: new Date().toISOString(),
      error: err.message,
    }, { status: 503 });
  }
}
