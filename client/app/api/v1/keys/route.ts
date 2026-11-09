import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.API_URL || 'http://localhost:4000';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const params = projectId ? `?projectId=${projectId}` : '';

    const response = await fetch(`${BACKEND_URL}/api/v1/keys${params}`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Backend error' }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Keys proxy error:', err.message);
    return NextResponse.json({ providerKeys: [], gatewayKeys: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Map frontend key type conventions to backend format
    const backendBody: any = { ...body };
    if (body.type === 'PROVIDER') {
      backendBody.plainKey = body.rawKey;
    }

    const response = await fetch(`${BACKEND_URL}/api/v1/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backendBody),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err: any) {
    console.error('Create key proxy error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type') || 'PROVIDER';

    const response = await fetch(`${BACKEND_URL}/api/v1/keys?id=${id}&type=${type}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err: any) {
    console.error('Delete key proxy error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
