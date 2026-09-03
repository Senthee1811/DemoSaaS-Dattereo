import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const db = getDb();

    // 1. Overall Aggregates
    let totalSpendSql = 'SELECT COALESCE(SUM(cost_estimate), 0) as totalSpend, COALESCE(SUM(total_tokens), 0) as totalTokens, COUNT(*) as totalRequests, COALESCE(AVG(latency_ms), 0) as avgLatency FROM requests';
    let anomalySql = 'SELECT COUNT(*) as anomalyCount FROM requests WHERE is_anomaly = 1';
    let blockedSql = 'SELECT COUNT(*) as blockedCount FROM requests WHERE is_blocked = 1';
    
    if (projectId) {
      totalSpendSql += ` WHERE project_id = '${projectId}'`;
      anomalySql += ` AND project_id = '${projectId}'`;
      blockedSql += ` AND project_id = '${projectId}'`;
    }

    const overall = db.prepare(totalSpendSql).get() as any;
    const anomalyRes = db.prepare(anomalySql).get() as any;
    const blockedRes = db.prepare(blockedSql).get() as any;

    // Total monthly budget across relevant projects
    let budgetSql = 'SELECT COALESCE(SUM(budget_monthly), 0) as totalBudget FROM projects';
    if (projectId) {
      budgetSql += ` WHERE id = '${projectId}'`;
    }
    const budgetRes = db.prepare(budgetSql).get() as any;
    const totalBudget = budgetRes.totalBudget || 5000;
    const totalSpend = Math.round(overall.totalSpend * 100) / 100;
    const budgetUtilizationPct = totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0;

    // 2. Spend Over Time (Daily - past 7 days)
    const dailySpend = db.prepare(`
      SELECT 
        DATE(created_at) as date,
        ROUND(SUM(cost_estimate), 4) as spend,
        SUM(total_tokens) as tokens,
        COUNT(*) as requests
      FROM requests
      ${projectId ? `WHERE project_id = '${projectId}'` : ''}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
      LIMIT 14
    `).all();

    // 3. Per-Model Breakdown
    const modelBreakdown = db.prepare(`
      SELECT 
        model,
        provider,
        ROUND(SUM(cost_estimate), 4) as spend,
        SUM(total_tokens) as tokens,
        COUNT(*) as requests,
        ROUND(AVG(latency_ms), 0) as avgLatency
      FROM requests
      ${projectId ? `WHERE project_id = '${projectId}'` : ''}
      GROUP BY model, provider
      ORDER BY spend DESC
    `).all() as any[];

    const enhancedModels = modelBreakdown.map(m => ({
      ...m,
      spendSharePct: totalSpend > 0 ? Math.round(((m.spend / totalSpend) * 100) * 10) / 10 : 0
    }));

    // 4. Per-Project Breakdown
    const projectBreakdown = db.prepare(`
      SELECT 
        p.id,
        p.name,
        p.budget_monthly as budgetMonthly,
        p.is_blocked as isBlocked,
        ROUND(COALESCE(SUM(r.cost_estimate), 0), 2) as spend,
        COALESCE(SUM(r.total_tokens), 0) as tokens,
        COUNT(r.id) as requests
      FROM projects p
      LEFT JOIN requests r ON p.id = r.project_id
      GROUP BY p.id
      ORDER BY spend DESC
    `).all() as any[];

    const enhancedProjects = projectBreakdown.map(p => ({
      ...p,
      isBlocked: Boolean(p.isBlocked),
      utilizationPct: p.budgetMonthly > 0 ? Math.round(((p.spend / p.budgetMonthly) * 100) * 10) / 10 : 0
    }));

    // 5. Per-User Breakdown
    const userBreakdown = db.prepare(`
      SELECT 
        u.id,
        u.name,
        u.email,
        u.role,
        u.avatar_url as avatarUrl,
        ROUND(COALESCE(SUM(r.cost_estimate), 0), 2) as spend,
        COALESCE(SUM(r.total_tokens), 0) as tokens,
        COUNT(r.id) as requests
      FROM users u
      LEFT JOIN requests r ON u.id = r.user_id
      GROUP BY u.id
      ORDER BY spend DESC
    `).all();

    // 6. Recent Request Feed (last 20)
    let recentSql = `
      SELECT 
        r.id,
        r.project_id as projectId,
        p.name as projectName,
        r.user_id as userId,
        u.name as userName,
        r.provider,
        r.model,
        r.tokens_in as tokensIn,
        r.tokens_out as tokensOut,
        r.total_tokens as totalTokens,
        ROUND(r.cost_estimate, 6) as costEstimate,
        r.latency_ms as latencyMs,
        r.status_code as statusCode,
        r.is_anomaly as isAnomaly,
        r.anomaly_reason as anomalyReason,
        r.is_blocked as isBlocked,
        r.prompt_preview as promptPreview,
        r.response_preview as responsePreview,
        r.created_at as timestamp
      FROM requests r
      LEFT JOIN projects p ON r.project_id = p.id
      LEFT JOIN users u ON r.user_id = u.id
      ${projectId ? `WHERE r.project_id = '${projectId}'` : ''}
      ORDER BY r.created_at DESC
      LIMIT 20
    `;
    const recentRequests = db.prepare(recentSql).all().map((r: any) => ({
      ...r,
      isAnomaly: Boolean(r.isAnomaly),
      isBlocked: Boolean(r.isBlocked)
    }));

    return NextResponse.json({
      summary: {
        totalSpend,
        totalBudget,
        budgetUtilizationPct: Math.round(budgetUtilizationPct * 10) / 10,
        totalTokens: overall.totalTokens || 0,
        totalRequests: overall.totalRequests || 0,
        avgLatencyMs: Math.round(overall.avgLatency || 0),
        anomalyCount: anomalyRes.anomalyCount || 0,
        blockedCount: blockedRes.blockedCount || 0
      },
      dailySpend,
      modelBreakdown: enhancedModels,
      projectBreakdown: enhancedProjects,
      userBreakdown,
      recentRequests
    });
  } catch (err: any) {
    console.error('Analytics API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
