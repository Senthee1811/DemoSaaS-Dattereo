import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Encrypts a key using AES-256-GCM (matches EncryptionService format)
 */
function encryptKey(plaintext: string, masterKey: string): string {
  const key = crypto.createHash('sha256').update(masterKey).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Hashes a password with argon2-like format (simplified for seed)
 * In production, the AuthService uses real argon2.
 */
function hashPassword(password: string): string {
  // Use SHA-256 for seed data only — real auth uses argon2
  return `$seed$${crypto.createHash('sha256').update(password).digest('hex')}`;
}

async function main() {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY || 'spendguard-master-encryption-key-32b!';

  console.log('🌱 Seeding SpendGuard database...');

  // 1. Create demo organization
  const org = await prisma.organization.upsert({
    where: { slug: 'apex-innovations' },
    update: {},
    create: {
      name: 'Apex Innovations Inc.',
      slug: 'apex-innovations',
    },
  });
  console.log(`  ✓ Organization: ${org.name} (${org.id})`);

  // 2. Create demo users
  const users = [
    { name: 'Sarah Chen', email: 'sarah.chen@apexai.io', role: 'OWNER' as const, password: 'demo-password-123' },
    { name: 'Alex Rivera', email: 'alex.rivera@apexai.io', role: 'ADMIN' as const, password: 'demo-password-123' },
    { name: 'Elena Rostova', email: 'elena.rostova@apexai.io', role: 'MEMBER' as const, password: 'demo-password-123' },
    { name: 'Marcus Vance', email: 'marcus.vance@apexai.io', role: 'MEMBER' as const, password: 'demo-password-123' },
  ];

  const createdUsers: any[] = [];
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        orgId: org.id,
        name: u.name,
        email: u.email,
        passwordHash: hashPassword(u.password),
        role: u.role,
      },
    });
    createdUsers.push(user);
    console.log(`  ✓ User: ${user.name} (${user.role})`);
  }

  // 3. Create demo projects
  const projectDefs = [
    { name: 'Customer AI Copilot', slug: 'customer-ai-copilot', description: 'Real-time assistant for Tier 1 customer support operations', budgetMonthly: 1200, budgetWeekly: 300 },
    { name: 'DevStudio CodeGen', slug: 'devstudio-codegen', description: 'Internal engineering code completion & test synthesizer', budgetMonthly: 850, budgetWeekly: 212 },
    { name: 'GenAI Research Lab', slug: 'genai-research-lab', description: 'Exploratory multi-modal evaluation and synthetic data generation', budgetMonthly: 2500, budgetWeekly: 625 },
    { name: 'Growth & Content Agent', slug: 'growth-content-agent', description: 'Automated SEO article generator & ad copy variations', budgetMonthly: 400, budgetWeekly: 100 },
  ];

  const createdProjects: any[] = [];
  for (const p of projectDefs) {
    const project = await prisma.project.upsert({
      where: { orgId_slug: { orgId: org.id, slug: p.slug } },
      update: {},
      create: {
        orgId: org.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        budgetMonthly: p.budgetMonthly,
        budgetWeekly: p.budgetWeekly,
        budgetHardBlockEnabled: true,
        isBlocked: false,
      },
    });
    createdProjects.push(project);
    console.log(`  ✓ Project: ${project.name} ($${p.budgetMonthly}/mo)`);

    // Create alert config for each project
    await prisma.alertConfig.upsert({
      where: { projectId: project.id },
      update: {},
      create: {
        projectId: project.id,
        warningThresholdPct: 80.0,
        hardBlockPct: 100.0,
        notifyOnAnomaly: true,
      },
    });

    // Create demo provider API keys for each project
    const providers: Array<{ provider: 'OPENAI' | 'ANTHROPIC' | 'GEMINI'; keyName: string; demoKey: string; prefix: string }> = [
      { provider: 'OPENAI', keyName: 'Production OpenAI Key', demoKey: 'sk-proj-demo-openai-key-not-real', prefix: 'sk-proj-9A...' },
      { provider: 'ANTHROPIC', keyName: 'Anthropic Enterprise Key', demoKey: 'sk-ant-api-demo-anthropic-key-not-real', prefix: 'sk-ant-api...' },
      { provider: 'GEMINI', keyName: 'Google Cloud Gemini Key', demoKey: 'AIzaSyB3-demo-gemini-key-not-real', prefix: 'AIzaSyB3...' },
    ];

    for (const pk of providers) {
      await prisma.providerApiKey.create({
        data: {
          projectId: project.id,
          provider: pk.provider,
          keyName: pk.keyName,
          keyPrefix: pk.prefix,
          maskedPreview: `${pk.prefix.slice(0, 3)}...${pk.demoKey.slice(-4)}`,
          encryptedKey: encryptKey(pk.demoKey, masterKey),
          isActive: true,
        },
      });
    }

    // Create gateway key for each project (SpendGuard sg_live_* format)
    const gwSecret = crypto.randomBytes(24).toString('hex');
    const gwKeyPrefix = `sg_live_${gwSecret.slice(0, 6)}`;
    const fullSecret = `${gwKeyPrefix}_${gwSecret}`;
    const pepper = process.env.JWT_ACCESS_SECRET || 'spendguard-pepper-default-salt';
    const gwHashedSecret = crypto.createHmac('sha256', pepper).update(fullSecret).digest('hex');

    await prisma.gatewayApiKey.create({
      data: {
        projectId: project.id,
        keyName: 'Primary App Service Gateway Token',
        keyPrefix: gwKeyPrefix,
        hashedSecret: gwHashedSecret,
        environment: 'live',
        rateLimitRpm: 1200,
        rateLimitTpm: 100000,
        isActive: true,
      },
    });
  }

  // 4. Seed sample requests (180 requests over past 7 days)
  const models = [
    { provider: 'OPENAI' as const, model: 'gpt-4o' },
    { provider: 'OPENAI' as const, model: 'gpt-4o-mini' },
    { provider: 'ANTHROPIC' as const, model: 'claude-3-5-sonnet-20241022' },
    { provider: 'GEMINI' as const, model: 'gemini-1.5-pro' },
    { provider: 'GEMINI' as const, model: 'gemini-1.5-flash' },
  ];

  const PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
    'gpt-4o': { inputPer1M: 2.50, outputPer1M: 10.00 },
    'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.60 },
    'claude-3-5-sonnet-20241022': { inputPer1M: 3.00, outputPer1M: 15.00 },
    'gemini-1.5-pro': { inputPer1M: 1.25, outputPer1M: 5.00 },
    'gemini-1.5-flash': { inputPer1M: 0.075, outputPer1M: 0.30 },
  };

  const samplePrompts = [
    'Analyze customer ticket #49102 regarding billing discrepancies.',
    'Refactor React component to optimize re-renders using useMemo.',
    'Draft enterprise security evaluation checklist for SOC2 Type II.',
    'Summarize 45-page quarterly sales transcript and extract action items.',
    'Generate unit tests with Vitest for payment gateway webhook handler.',
    'Synthesize user feedback sentiments across 1,200 App Store reviews.',
  ];

  const now = new Date();
  let requestCount = 0;

  for (let i = 0; i < 180; i++) {
    const hoursAgo = Math.floor(Math.random() * (7 * 24));
    const reqTime = new Date(now.getTime() - hoursAgo * 3600 * 1000 - Math.floor(Math.random() * 3600 * 1000));
    const project = createdProjects[Math.floor(Math.random() * createdProjects.length)];
    const user = createdUsers[Math.floor(Math.random() * createdUsers.length)];
    const m = models[Math.floor(Math.random() * models.length)];

    const isAnomaly = i === 12 || i === 75 || i === 130;
    const tokensIn = isAnomaly ? Math.floor(Math.random() * 25000 + 15000) : Math.floor(Math.random() * 1800 + 150);
    const tokensOut = isAnomaly ? Math.floor(Math.random() * 8000 + 4000) : Math.floor(Math.random() * 1200 + 100);
    const totalTokens = tokensIn + tokensOut;

    const pricing = PRICING[m.model] || PRICING['gpt-4o-mini'];
    const cost = Number(((tokensIn / 1_000_000) * pricing.inputPer1M + (tokensOut / 1_000_000) * pricing.outputPer1M).toFixed(6));

    const latency = Math.floor(Math.random() * 750 + 180);
    const isBlocked = project.slug === 'growth-content-agent' && hoursAgo < 16;

    await prisma.request.create({
      data: {
        id: `req_seed_${i.toString().padStart(4, '0')}`,
        projectId: project.id,
        userId: user.id,
        provider: m.provider,
        model: m.model,
        tokensIn,
        tokensOut,
        totalTokens,
        costEstimate: cost,
        latencyMs: latency,
        statusCode: isBlocked ? 429 : 200,
        isAnomaly,
        anomalyReason: isAnomaly ? `Abnormal Token Surge: ${totalTokens.toLocaleString()} tokens ($${cost.toFixed(4)})` : null,
        isBlocked,
        promptPreview: samplePrompts[Math.floor(Math.random() * samplePrompts.length)],
        responsePreview: isBlocked ? 'BLOCKED: Budget cap exceeded' : 'SpendGuard governed completion.',
        createdAt: reqTime,
      },
    });
    requestCount++;
  }
  console.log(`  ✓ Seeded ${requestCount} sample requests`);

  // 5. Seed budget alerts
  await prisma.budgetAlert.createMany({
    data: [
      {
        projectId: createdProjects[3].id, // Growth & Content Agent
        thresholdType: 'HARD_BLOCK',
        thresholdValue: 400.0,
        channel: 'SLACK',
        title: '🛑 Hard-Block Activated: Growth & Content Agent',
        message: 'Monthly budget cap of $400.00 reached. Future API calls blocked.',
        isRead: false,
        status: 'SENT',
      },
      {
        projectId: createdProjects[0].id, // Customer AI Copilot
        thresholdType: 'PERCENT_80',
        thresholdValue: 960.0,
        channel: 'EMAIL',
        title: '⚠️ Soft Warning (80%): Customer AI Copilot',
        message: 'Project spend has reached 81.8% of $1,200.00 monthly allocation.',
        isRead: false,
        status: 'SENT',
      },
      {
        projectId: createdProjects[2].id, // GenAI Research Lab
        thresholdType: 'ANOMALY_DETECTED',
        thresholdValue: 0.0,
        channel: 'IN_APP',
        title: '⚡ Anomaly Detected: 33,000 Token Spike',
        message: 'Actor Sarah Chen triggered 33,000 tokens. Deviation is 5.8σ above baseline.',
        isRead: true,
        status: 'SENT',
      },
    ],
  });
  console.log('  ✓ Seeded 3 budget alerts');

  // Seed Model Pricing Catalog (PRD FR4 & Step 6)
  const defaultPricingRows = [
    { model: 'gpt-4o', provider: 'OPENAI' as const, inputPricePerMillion: 2.50, outputPricePerMillion: 10.00, displayName: 'GPT-4o (Omni)', contextWindow: 128000 },
    { model: 'gpt-4o-mini', provider: 'OPENAI' as const, inputPricePerMillion: 0.15, outputPricePerMillion: 0.60, displayName: 'GPT-4o Mini', contextWindow: 128000 },
    { model: 'o1', provider: 'OPENAI' as const, inputPricePerMillion: 15.00, outputPricePerMillion: 60.00, displayName: 'o1 (Reasoning)', contextWindow: 200000 },
    { model: 'o1-mini', provider: 'OPENAI' as const, inputPricePerMillion: 3.00, outputPricePerMillion: 12.00, displayName: 'o1 Mini', contextWindow: 128000 },
    { model: 'gpt-4-turbo', provider: 'OPENAI' as const, inputPricePerMillion: 10.00, outputPricePerMillion: 30.00, displayName: 'GPT-4 Turbo', contextWindow: 128000 },
    { model: 'gpt-3.5-turbo', provider: 'OPENAI' as const, inputPricePerMillion: 0.50, outputPricePerMillion: 1.50, displayName: 'GPT-3.5 Turbo', contextWindow: 16385 },
    { model: 'claude-3-5-sonnet-20241022', provider: 'ANTHROPIC' as const, inputPricePerMillion: 3.00, outputPricePerMillion: 15.00, displayName: 'Claude 3.5 Sonnet (v2)', contextWindow: 200000 },
    { model: 'claude-3-5-sonnet', provider: 'ANTHROPIC' as const, inputPricePerMillion: 3.00, outputPricePerMillion: 15.00, displayName: 'Claude 3.5 Sonnet', contextWindow: 200000 },
    { model: 'claude-3-5-haiku-20241022', provider: 'ANTHROPIC' as const, inputPricePerMillion: 0.80, outputPricePerMillion: 4.00, displayName: 'Claude 3.5 Haiku', contextWindow: 200000 },
    { model: 'claude-3-opus-20240229', provider: 'ANTHROPIC' as const, inputPricePerMillion: 15.00, outputPricePerMillion: 75.00, displayName: 'Claude 3 Opus', contextWindow: 200000 },
    { model: 'gemini-1.5-pro', provider: 'GEMINI' as const, inputPricePerMillion: 1.25, outputPricePerMillion: 5.00, displayName: 'Gemini 1.5 Pro', contextWindow: 2000000 },
    { model: 'gemini-1.5-flash', provider: 'GEMINI' as const, inputPricePerMillion: 0.075, outputPricePerMillion: 0.30, displayName: 'Gemini 1.5 Flash', contextWindow: 1000000 },
    { model: 'gemini-2.0-flash-exp', provider: 'GEMINI' as const, inputPricePerMillion: 0.00, outputPricePerMillion: 0.00, displayName: 'Gemini 2.0 Flash (Exp)', contextWindow: 1000000 },
  ];

  for (const pr of defaultPricingRows) {
    await prisma.modelPricing.upsert({
      where: { model: pr.model },
      update: {
        inputPricePerMillion: pr.inputPricePerMillion,
        outputPricePerMillion: pr.outputPricePerMillion,
        displayName: pr.displayName,
        contextWindow: pr.contextWindow,
      },
      create: {
        model: pr.model,
        provider: pr.provider,
        inputPricePerMillion: pr.inputPricePerMillion,
        outputPricePerMillion: pr.outputPricePerMillion,
        displayName: pr.displayName,
        contextWindow: pr.contextWindow,
        isActive: true,
      },
    });
  }
  console.log(`  ✓ Seeded ${defaultPricingRows.length} model pricing rates`);

  console.log('\n✅ Seed complete!\n');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
