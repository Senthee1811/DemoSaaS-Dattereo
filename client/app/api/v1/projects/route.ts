import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getProjectSpendSummary } from '@/lib/budget';
import { logAuditEvent } from '@/lib/audit';

export async function GET() {
  try {
    const db = getDb();
    const projects = db.prepare(`
      SELECT p.*, o.name as org_name
      FROM projects p
      LEFT JOIN organizations o ON p.org_id = o.id
      ORDER BY p.created_at DESC
    `).all() as any[];

    const enhanced = projects.map(p => {
      const { monthlySpend, weeklySpend, requestCount } = getProjectSpendSummary(p.id);
      const budgetMonthly = p.budget_monthly;
      const utilizationPct = budgetMonthly > 0 ? (monthlySpend / budgetMonthly) * 100 : 0;
      
      return {
        id: p.id,
        orgId: p.org_id,
        orgName: p.org_name,
        name: p.name,
        slug: p.slug,
        description: p.description,
        budgetMonthly: p.budget_monthly,
        budgetWeekly: p.budget_weekly,
        budgetHardBlockEnabled: Boolean(p.budget_hard_block_enabled),
        isBlocked: Boolean(p.is_blocked),
        blockReason: p.block_reason,
        currentMonthlySpend: monthlySpend,
        currentWeeklySpend: weeklySpend,
        utilizationPct: Math.round(utilizationPct * 10) / 10,
        requestCount,
        createdAt: p.created_at
      };
    });

    return NextResponse.json({ projects: enhanced });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, slug, description, budgetMonthly, budgetWeekly, budgetHardBlockEnabled } = body;

    if (!name) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const db = getDb();
    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as any;
    const orgId = org ? org.id : 'org_spendguard_demo';

    const id = `proj_${slug || name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36).substring(2, 5)}`;
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const monthly = typeof budgetMonthly === 'number' ? budgetMonthly : 500.0;
    const weekly = typeof budgetWeekly === 'number' ? budgetWeekly : monthly / 4;
    const hardBlock = budgetHardBlockEnabled !== undefined ? (budgetHardBlockEnabled ? 1 : 0) : 1;

    db.prepare(`
      INSERT INTO projects (id, org_id, name, slug, description, budget_monthly, budget_weekly, budget_hard_block_enabled, is_blocked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, orgId, name, finalSlug, description || null, monthly, weekly, hardBlock);

    // Create default alert config
    db.prepare(`
      INSERT INTO alert_configs (id, project_id, warning_threshold_pct, hard_block_pct, notify_on_anomaly)
      VALUES (?, ?, 80.0, 100.0, 1)
    `).run(`acfg_${id}`, id);

    logAuditEvent({
      orgId,
      projectId: id,
      actorName: 'Sarah Chen',
      actorEmail: 'sarah.chen@apexai.io',
      action: 'PROJECT_CREATED',
      resourceType: 'PROJECT',
      resourceId: id,
      metadata: { name, budgetMonthly: monthly, hardBlockEnabled: !!hardBlock }
    });

    return NextResponse.json({ success: true, projectId: id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, budgetMonthly, budgetWeekly, budgetHardBlockEnabled, isBlocked, blockReason } = body;

    if (!id) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    const db = getDb();
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const newMonthly = budgetMonthly !== undefined ? Number(budgetMonthly) : existing.budget_monthly;
    const newWeekly = budgetWeekly !== undefined ? Number(budgetWeekly) : existing.budget_weekly;
    const newHardBlock = budgetHardBlockEnabled !== undefined ? (budgetHardBlockEnabled ? 1 : 0) : existing.budget_hard_block_enabled;
    const newIsBlocked = isBlocked !== undefined ? (isBlocked ? 1 : 0) : existing.is_blocked;
    const newReason = blockReason !== undefined ? blockReason : (newIsBlocked ? 'Manually blocked by administrator' : null);

    db.prepare(`
      UPDATE projects
      SET budget_monthly = ?, budget_weekly = ?, budget_hard_block_enabled = ?, is_blocked = ?, block_reason = ?
      WHERE id = ?
    `).run(newMonthly, newWeekly, newHardBlock, newIsBlocked, newReason, id);

    logAuditEvent({
      orgId: existing.org_id,
      projectId: id,
      actorName: 'Sarah Chen',
      actorEmail: 'sarah.chen@apexai.io',
      action: isBlocked !== undefined ? (newIsBlocked ? 'PROJECT_HARD_BLOCKED' : 'PROJECT_UNBLOCKED') : 'BUDGET_UPDATED',
      resourceType: 'PROJECT',
      resourceId: id,
      metadata: { budgetMonthly: newMonthly, isBlocked: !!newIsBlocked, blockReason: newReason }
    });

    return NextResponse.json({ success: true, message: 'Project configuration updated' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
