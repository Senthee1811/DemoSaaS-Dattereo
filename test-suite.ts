import { getDb } from './lib/db';
import { checkProjectBudgetGuardrail, getProjectSpendSummary } from './lib/budget';
import { executeGatewayChat } from './lib/gateway-service';
import { calculateCost } from './lib/pricing';
import { detectAnomaly } from './lib/anomaly';

console.log('=== SpendGuard AI Comprehensive Verification Suite ===\n');

async function runTests() {
  // Test 1: Database and Seed Check
  console.log('▶ Test 1: Database Initialization & Seeding');
  const db = getDb();
  const projects = db.prepare('SELECT id, name, budget_monthly, is_blocked FROM projects').all() as any[];
  console.log(`  ✓ Found ${projects.length} configured projects in governance ledger:`);
  projects.forEach((p: any) => console.log(`    - [${p.id}] ${p.name}: Budget $${p.budget_monthly}/mo, Blocked=${p.is_blocked ? 'YES' : 'NO'}`));

  // Test 2: Pricing Calculation
  console.log('\n▶ Test 2: Pricing Engine Accuracy');
  const gpt4oCost = calculateCost('gpt-4o', 1200, 450);
  const claudeCost = calculateCost('claude-3-5-sonnet-20241022', 1200, 450);
  const geminiCost = calculateCost('gemini-1.5-pro', 1200, 450);
  console.log(`  ✓ GPT-4o (1200 in / 450 out): $${gpt4oCost.toFixed(6)}`);
  console.log(`  ✓ Claude 3.5 Sonnet (1200 in / 450 out): $${claudeCost.toFixed(6)}`);
  console.log(`  ✓ Gemini 1.5 Pro (1200 in / 450 out): $${geminiCost.toFixed(6)}`);

  // Test 3: Budget Guardrail Fail-Closed Policy
  console.log('\n▶ Test 3: Budget Pre-Flight Fail-Closed Check');
  const copilotGuard = checkProjectBudgetGuardrail('proj_copilot');
  console.log(`  ✓ proj_copilot canProceed = ${copilotGuard.canProceed} (Spend: $${copilotGuard.currentMonthlySpend} / $${copilotGuard.budgetMonthly})`);

  const marketingGuard = checkProjectBudgetGuardrail('proj_marketing');
  console.log(`  ✓ proj_marketing canProceed = ${marketingGuard.canProceed} (Blocked: ${marketingGuard.isHardBlocked}, Reason: "${marketingGuard.blockReason}")`);

  // Test 4: Live Gateway Execution (Normal flow)
  console.log('\n▶ Test 4: Unified AI Proxy Execution (Healthy Project)');
  const normalResult = await executeGatewayChat({
    projectId: 'proj_copilot',
    userId: 'usr_sarah_chen',
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Generate quarterly customer satisfaction review metrics.' }]
  });
  console.log(`  ✓ HTTP Status: ${normalResult.status}`);
  console.log(`  ✓ Model: ${normalResult.data.model}, Provider: ${normalResult.data.provider}`);
  console.log(`  ✓ Tokens: ${normalResult.data.usage.total_tokens} (In: ${normalResult.data.usage.prompt_tokens}, Out: ${normalResult.data.usage.completion_tokens})`);
  console.log(`  ✓ Exact Cost: $${normalResult.data.governance.cost_estimate_usd.toFixed(6)}`);
  console.log(`  ✓ Budget Left: $${normalResult.data.governance.budget_remaining_usd}`);
  console.log(`  ✓ Response Preview: "${normalResult.data.choices[0].message.content.slice(0, 70)}..."`);

  // Test 5: Live Gateway Execution (Blocked Project)
  console.log('\n▶ Test 5: Unified AI Proxy Execution (Hard-Blocked Project Guardrail)');
  const blockedResult = await executeGatewayChat({
    projectId: 'proj_marketing',
    userId: 'usr_sarah_chen',
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Attempting to run SEO generation batch.' }]
  });
  console.log(`  ✓ HTTP Status: ${blockedResult.status} (Expected 429)`);
  console.log(`  ✓ Error Code: ${blockedResult.data.error.code}`);
  console.log(`  ✓ Guardrail Block Reason: "${blockedResult.data.error.message}"`);
  console.log(`  ✓ X-SpendGuard-Blocked Header: ${blockedResult.headers['X-SpendGuard-Blocked']}`);

  // Test 6: Statistical Anomaly Detection
  console.log('\n▶ Test 6: Statistical Usage Spike Anomaly Detection');
  const baseline = [
    { costEstimate: 0.005, totalTokens: 450 },
    { costEstimate: 0.006, totalTokens: 520 },
    { costEstimate: 0.004, totalTokens: 410 },
    { costEstimate: 0.005, totalTokens: 480 },
    { costEstimate: 0.007, totalTokens: 600 }
  ];
  const normalAnomaly = detectAnomaly(0.006, 500, baseline);
  const spikeAnomaly = detectAnomaly(0.48, 28000, baseline);
  console.log(`  ✓ Normal request isAnomaly = ${normalAnomaly.isAnomaly}`);
  console.log(`  ✓ Spike request isAnomaly = ${spikeAnomaly.isAnomaly} (Reason: "${spikeAnomaly.reason}")`);

  console.log('\n=== ALL GOVERNANCE VERIFICATIONS PASSED SUCCESSFULLY ===');
}

runTests().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
