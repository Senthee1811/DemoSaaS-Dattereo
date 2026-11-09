import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.API_URL || 'http://localhost:4000';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const params = projectId ? `?projectId=${projectId}` : '';

    const response = await fetch(`${BACKEND_URL}/api/v1/audit/export${params}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Export failed' }, { status: response.status });
    }

    const csvContent = await response.text();
    const filename = `spendguard-audit-export-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error('Audit export proxy error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
