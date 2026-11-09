import { getDb } from './db';
import { Project, BudgetAlert, AlertChannel, ThresholdType } from './types';

export interface BudgetStatus {
  projectId: string;
  projectName: string;
  budgetMonthly: number;
  currentMonthlySpend: number;
  percentageUsed: number;
  isHardBlocked: boolean;
  blockReason?: string;
  canProceed: boolean;
}

/**
 * Calculates current month spend for a project
 */
export function getProjectSpendSummary(projectId: string): { monthlySpend: number; weeklySpend: number; requestCount: number } {
  const db = getDb();
  
  // Calculate start of current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  
  // Calculate start of current week (last 7 days)
  const startOfWeek = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();

  const monthlyRes = db.prepare(`
    SELECT COALESCE(SUM(cost_estimate), 0) as totalCost, COUNT(*) as totalReqs
    FROM requests
    WHERE project_id = ? AND created_at >= ?
  `).get(projectId, startOfMonth) as { totalCost: number; totalReqs: number };

  const weeklyRes = db.prepare(`
    SELECT COALESCE(SUM(cost_estimate), 0) as totalCost
    FROM requests
    WHERE project_id = ? AND created_at >= ?
  `).get(projectId, startOfWeek) as { totalCost: number };

  return {
    monthlySpend: Math.round(monthlyRes.totalCost * 1000) / 1000,
    weeklySpend: Math.round(weeklyRes.totalCost * 1000) / 1000,
    requestCount: monthlyRes.totalReqs
  };
}

/**
 * Evaluates whether a project can make an AI request or if it is blocked
 */
export function checkProjectBudgetGuardrail(projectId: string): BudgetStatus {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;

  if (!project) {
    return {
      projectId,
      projectName: 'Unknown Project',
      budgetMonthly: 0,
      currentMonthlySpend: 0,
      percentageUsed: 100,
      isHardBlocked: true,
      blockReason: 'Project not found in governance directory',
      canProceed: false
    };
  }

  const { monthlySpend } = getProjectSpendSummary(projectId);
  const percentage = project.budget_monthly > 0 ? (monthlySpend / project.budget_monthly) * 100 : 0;

  // Check manual or previous block
  if (project.is_blocked) {
    return {
      projectId: project.id,
      projectName: project.name,
      budgetMonthly: project.budget_monthly,
      currentMonthlySpend: monthlySpend,
      percentageUsed: percentage,
      isHardBlocked: true,
      blockReason: project.block_reason || 'Hard-block actively enforced by administrator or budget cap',
      canProceed: false
    };
  }

  // Check automatic hard-block threshold
  if (project.budget_hard_block_enabled && monthlySpend >= project.budget_monthly) {
    // Automatically set blocked state in DB
    const reason = `Budget Cap Exceeded: Monthly spend $${monthlySpend.toFixed(2)} reached cap of $${project.budget_monthly.toFixed(2)}`;
    db.prepare('UPDATE projects SET is_blocked = 1, block_reason = ? WHERE id = ?').run(reason, projectId);

    // Record audit log
    db.prepare(`
      INSERT INTO audit_logs (id, org_id, project_id, actor_name, actor_email, action, resource_type, resource_id, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `aud_guard_${Date.now()}`,
      project.org_id,
      project.id,
      'SpendGuard Governance Engine',
      'guardrail@spendguard.ai',
      'AUTOMATIC_HARD_BLOCK_TRIGGERED',
      'PROJECT',
      project.id,
      JSON.stringify({ monthlySpend, budgetMonthly: project.budget_monthly })
    );

    // Trigger Hard-Block Alert
    recordBudgetAlert({
      projectId: project.id,
      projectName: project.name,
      thresholdType: 'HARD_BLOCK',
      thresholdValue: project.budget_monthly,
      channel: 'SLACK',
      title: `🚨 Emergency Budget Hard-Block: ${project.name}`,
      message: `Project reached 100% of allocation ($${monthlySpend.toFixed(2)} / $${project.budget_monthly.toFixed(2)}). All incoming requests blocked.`,
    });

    return {
      projectId: project.id,
      projectName: project.name,
      budgetMonthly: project.budget_monthly,
      currentMonthlySpend: monthlySpend,
      percentageUsed: percentage,
      isHardBlocked: true,
      blockReason: reason,
      canProceed: false
    };
  }

  return {
    projectId: project.id,
    projectName: project.name,
    budgetMonthly: project.budget_monthly,
    currentMonthlySpend: monthlySpend,
    percentageUsed: percentage,
    isHardBlocked: false,
    canProceed: true
  };
}

/**
 * Evaluates and records soft warning alerts (e.g. 50%, 80%, 90%)
 */
export function evaluatePostRequestBudgetThresholds(projectId: string, newTotalMonthlySpend: number) {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  if (!project || project.budget_monthly <= 0) return;

  const pct = (newTotalMonthlySpend / project.budget_monthly) * 100;
  
  if (pct >= 90 && pct < 100) {
    checkAndSendThresholdAlert(project, 'PERCENT_90', 90, pct, newTotalMonthlySpend);
  } else if (pct >= 80 && pct < 90) {
    checkAndSendThresholdAlert(project, 'PERCENT_80', 80, pct, newTotalMonthlySpend);
  } else if (pct >= 50 && pct < 60) {
    checkAndSendThresholdAlert(project, 'PERCENT_50', 50, pct, newTotalMonthlySpend);
  }
}

function checkAndSendThresholdAlert(project: any, thresholdType: ThresholdType, targetPct: number, currentPct: number, spend: number) {
  const db = getDb();
  // Check if an alert for this threshold was already triggered in the last 24 hours
  const recent = db.prepare(`
    SELECT id FROM budget_alerts
    WHERE project_id = ? AND threshold_type = ? AND triggered_at >= datetime('now', '-1 day')
  `).get(project.id, thresholdType);

  if (!recent) {
    recordBudgetAlert({
      projectId: project.id,
      projectName: project.name,
      thresholdType,
      thresholdValue: (project.budget_monthly * targetPct) / 100,
      channel: 'EMAIL',
      title: `⚠️ Soft Budget Alert: ${project.name} at ${currentPct.toFixed(1)}%`,
      message: `Project spend has reached $${spend.toFixed(2)} of $${project.budget_monthly.toFixed(2)} allocation.`,
    });
  }
}

export function recordBudgetAlert(alert: {
  projectId: string;
  projectName?: string;
  thresholdType: ThresholdType;
  thresholdValue: number;
  channel: AlertChannel;
  title: string;
  message: string;
}) {
  const db = getDb();
  const id = `alt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  db.prepare(`
    INSERT INTO budget_alerts (id, project_id, threshold_type, threshold_value, channel, title, message, is_read, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'SENT')
  `).run(id, alert.projectId, alert.thresholdType, alert.thresholdValue, alert.channel, alert.title, alert.message);
}
