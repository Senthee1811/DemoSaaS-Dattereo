import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.API_URL || 'http://localhost:4000';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const params = projectId ? `?projectId=${projectId}` : '';

    const response = await fetch(`${BACKEND_URL}/api/v1/analytics${params}`, {
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
    console.error('Analytics proxy error:', err.message);
    // Return well-formed zero-state results (per Principle 2 — never NaN/undefined)
    return NextResponse.json({
      summary: {
        totalSpend: 0,
        totalBudget: 0,
        budgetUtilizationPct: 0,
        totalTokens: 0,
        totalRequests: 0,
        avgLatency: 0,
        anomalyCount: 0,
        blockedCount: 0,
      },
      dailySpend: [],
      modelBreakdown: [],
      projectBreakdown: [],
      recentRequests: [],
    });
  }
}
