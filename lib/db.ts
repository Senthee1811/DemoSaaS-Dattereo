import fs from 'fs';
import path from 'path';
import { encryptApiKey, generateGatewayToken } from './encryption';
import { MODEL_PRICING_CATALOG } from './pricing';

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'spendguard-store.json');

interface StoreState {
  organizations: any[];
  users: any[];
  projects: any[];
  provider_api_keys: any[];
  gateway_api_keys: any[];
  requests: any[];
  budget_alerts: any[];
  alert_configs: any[];
  audit_logs: any[];
}

let memoryState: StoreState | null = null;

function loadState(): StoreState {
  if (memoryState) return memoryState;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DATA_FILE)) {
    try {
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      memoryState = JSON.parse(content);
      return memoryState!;
    } catch (e) {
      console.warn('Failed to parse spendguard-store.json, re-initializing seed.');
    }
  }

  memoryState = seedInitialState();
  saveState(memoryState);
  return memoryState;
}

function saveState(state: StoreState) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist spendguard state:', err);
  }
}

function seedInitialState(): StoreState {
  const orgId = 'org_spendguard_demo';
  const organizations = [
    {
      id: orgId,
      name: 'Apex Innovations Inc.',
      slug: 'apex-innovations',
      plan: 'ENTERPRISE_PLUS',
      currency: 'USD',
      created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
    }
  ];

  const users = [
    { id: 'usr_sarah_chen', org_id: orgId, name: 'Sarah Chen', email: 'sarah.chen@apexai.io', role: 'OWNER', avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80', created_at: new Date().toISOString() },
    { id: 'usr_alex_rivera', org_id: orgId, name: 'Alex Rivera', email: 'alex.rivera@apexai.io', role: 'ADMIN', avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80', created_at: new Date().toISOString() },
    { id: 'usr_elena_rostova', org_id: orgId, name: 'Elena Rostova', email: 'elena.rostova@apexai.io', role: 'MEMBER', avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', created_at: new Date().toISOString() },
    { id: 'usr_marcus_vance', org_id: orgId, name: 'Marcus Vance', email: 'marcus.vance@apexai.io', role: 'MEMBER', avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80', created_at: new Date().toISOString() }
  ];

  const projects = [
    { id: 'proj_copilot', org_id: orgId, name: 'Customer AI Copilot', slug: 'customer-ai-copilot', description: 'Real-time assistant for Tier 1 customer support operations', budget_monthly: 1200, budget_weekly: 300, budget_hard_block_enabled: 1, is_blocked: 0, block_reason: null, created_at: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString() },
    { id: 'proj_codegen', org_id: orgId, name: 'DevStudio CodeGen', slug: 'devstudio-codegen', description: 'Internal engineering code completion & test synthesizer', budget_monthly: 850, budget_weekly: 212, budget_hard_block_enabled: 1, is_blocked: 0, block_reason: null, created_at: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString() },
    { id: 'proj_research', org_id: orgId, name: 'GenAI Research Lab', slug: 'genai-research-lab', description: 'Exploratory multi-modal evaluation and synthetic data generation', budget_monthly: 2500, budget_weekly: 625, budget_hard_block_enabled: 1, is_blocked: 0, block_reason: null, created_at: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString() },
    { id: 'proj_marketing', org_id: orgId, name: 'Growth & Content Agent', slug: 'growth-content-agent', description: 'Automated SEO article generator & ad copy variations', budget_monthly: 400, budget_weekly: 100, budget_hard_block_enabled: 1, is_blocked: 1, block_reason: 'Budget Exceeded: Monthly cap of $400 reached ($418.52 spent)', created_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString() }
  ];

  const provider_api_keys: any[] = [];
  const gateway_api_keys: any[] = [];
  const alert_configs: any[] = [];

  for (const p of projects) {
    provider_api_keys.push({
      id: `pkey_oai_${p.id}`,
      project_id: p.id,
      provider: 'OPENAI',
      key_name: 'Production OpenAI Key',
      key_prefix: 'sk-proj-9A...',
      encrypted_key: encryptApiKey('sk-proj-demo-live-production-openai-vault-key-92841'),
      is_active: 1,
      last_used_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });

    provider_api_keys.push({
      id: `pkey_claude_${p.id}`,
      project_id: p.id,
      provider: 'CLAUDE',
      key_name: 'Anthropic Enterprise Key',
      key_prefix: 'sk-ant-api...',
      encrypted_key: encryptApiKey('sk-ant-api03-live-anthropic-enterprise-vault-key-77192'),
      is_active: 1,
      last_used_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });

    provider_api_keys.push({
      id: `pkey_gemini_${p.id}`,
      project_id: p.id,
      provider: 'GEMINI',
      key_name: 'Google Cloud Gemini Key',
      key_prefix: 'AIzaSyB3...',
      encrypted_key: encryptApiKey('AIzaSyB3-demo-google-gemini-vault-token-44819'),
      is_active: 1,
      last_used_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });

    const gw = generateGatewayToken(p.id);
    gateway_api_keys.push({
      id: `gwk_${p.id}`,
      project_id: p.id,
      key_name: 'Primary App Service Gateway Token',
      key_prefix: gw.prefix,
      hashed_secret: gw.hashedSecret,
      rate_limit_rpm: 1200,
      is_active: 1,
      last_used_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });

    alert_configs.push({
      id: `acfg_${p.id}`,
      project_id: p.id,
      slack_webhook_url: 'https://api.spendguard.dev/webhooks/slack-alerts',
      email_recipients: JSON.stringify(['eng-alerts@apexai.io', 'sarah.chen@apexai.io']),
      warning_threshold_pct: 80.0,
      hard_block_pct: 100.0,
      notify_on_anomaly: 1
    });
  }

  // Requests seed
  const models = [
    { provider: 'OPENAI', model: 'gpt-4o' },
    { provider: 'OPENAI', model: 'gpt-4o-mini' },
    { provider: 'CLAUDE', model: 'claude-3-5-sonnet-20241022' },
    { provider: 'GEMINI', model: 'gemini-1.5-pro' },
    { provider: 'GEMINI', model: 'gemini-1.5-flash' }
  ];

  const samplePrompts = [
    "Analyze customer ticket #49102 regarding billing discrepancies and generate polite resolution summary.",
    "Refactor React component to optimize re-renders using useMemo and custom debounce hook.",
    "Draft enterprise security evaluation checklist for SOC2 Type II compliance audit.",
    "Summarize 45-page quarterly sales transcript and extract action items for leadership team.",
    "Generate unit tests with Vitest and mock API responses for payment gateway webhook handler.",
    "Synthesize user feedback sentiments across 1,200 App Store reviews for version 4.2 release."
  ];

  const requests: any[] = [];
  const now = new Date();

  for (let i = 0; i < 180; i++) {
    const hoursAgo = Math.floor(Math.random() * (7 * 24));
    const reqTime = new Date(now.getTime() - hoursAgo * 3600 * 1000 - Math.floor(Math.random() * 3600 * 1000));
    const project = projects[Math.floor(Math.random() * projects.length)];
    const user = users[Math.floor(Math.random() * users.length)];
    const m = models[Math.floor(Math.random() * models.length)];
    
    const isAnomaly = (i === 12 || i === 75 || i === 130);
    const tokensIn = isAnomaly ? Math.floor(Math.random() * 25000 + 15000) : Math.floor(Math.random() * 1800 + 150);
    const tokensOut = isAnomaly ? Math.floor(Math.random() * 8000 + 4000) : Math.floor(Math.random() * 1200 + 100);
    const totalTokens = tokensIn + tokensOut;

    const pricing = MODEL_PRICING_CATALOG[m.model] || { inputPer1k: 0.002, outputPer1k: 0.008 };
    let cost = ((tokensIn / 1000) * pricing.inputPer1k) + ((tokensOut / 1000) * pricing.outputPer1k);
    cost = Math.round(cost * 1000000) / 1000000;

    const latency = Math.floor(Math.random() * 750 + 180);
    const isBlocked = project.id === 'proj_marketing' && hoursAgo < 16 ? 1 : 0;
    const statusCode = isBlocked ? 429 : 200;

    const promptIdx = Math.floor(Math.random() * samplePrompts.length);
    const prompt = samplePrompts[promptIdx];
    const response = isBlocked ? 'Error: Project budget cap exceeded (Hard-Block active).' : 'Verified governed model completion generated by SpendGuard AI proxy layer.';

    requests.push({
      id: `req_${i.toString().padStart(4, '0')}_${project.slug.slice(0, 4)}`,
      project_id: project.id,
      user_id: user.id,
      provider: m.provider,
      model: m.model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      total_tokens: totalTokens,
      cost_estimate: cost,
      latency_ms: latency,
      status_code: statusCode,
      is_anomaly: isAnomaly ? 1 : 0,
      anomaly_reason: isAnomaly ? `Abnormal Token Surge: ${totalTokens.toLocaleString()} tokens ($${cost.toFixed(4)}) is 5.8x project average.` : null,
      is_blocked: isBlocked,
      prompt_preview: prompt,
      response_preview: response,
      metadata_json: JSON.stringify({ client_ip: '10.0.4.12', client_sdk: 'openai-python/1.30.0', environment: 'production' }),
      created_at: reqTime.toISOString()
    });
  }

  const budget_alerts = [
    {
      id: 'alt_001',
      project_id: 'proj_marketing',
      threshold_type: 'HARD_BLOCK',
      threshold_value: 400.0,
      triggered_at: new Date(now.getTime() - 14 * 3600 * 1000).toISOString(),
      channel: 'SLACK',
      title: '🚨 Hard Budget Block Triggered: Growth & Content Agent',
      message: 'Project has reached 104.6% ($418.52) of its $400.00 monthly cap. Further API calls blocked until limit is updated.',
      is_read: 0,
      status: 'SENT'
    },
    {
      id: 'alt_002',
      project_id: 'proj_copilot',
      threshold_type: 'PERCENT_80',
      threshold_value: 960.0,
      triggered_at: new Date(now.getTime() - 36 * 3600 * 1000).toISOString(),
      channel: 'EMAIL',
      title: '⚠️ Soft Warning (80% Budget): Customer AI Copilot',
      message: 'Project spend has reached $982.40 of $1,200.00 monthly allocation (81.8%). Estimated exhaustion in 4 days.',
      is_read: 0,
      status: 'SENT'
    },
    {
      id: 'alt_003',
      project_id: 'proj_research',
      threshold_type: 'ANOMALY_DETECTED',
      threshold_value: 0.0,
      triggered_at: new Date(now.getTime() - 48 * 3600 * 1000).toISOString(),
      channel: 'IN_APP',
      title: '⚡ Anomaly Detected: 33,000 Token Spike in Single Request',
      message: 'Actor Sarah Chen triggered 33,000 tokens on claude-3-5-sonnet-20241022 ($0.58). Deviation is 5.8σ above baseline.',
      is_read: 1,
      status: 'SENT'
    }
  ];

  const audit_logs = [
    {
      id: 'aud_001',
      org_id: orgId,
      project_id: 'proj_marketing',
      actor_name: 'SpendGuard Governance Engine',
      actor_email: 'guardrail@spendguard.ai',
      action: 'PROJECT_HARD_BLOCKED',
      resource_type: 'PROJECT',
      resource_id: 'proj_marketing',
      metadata_json: JSON.stringify({ reason: 'Monthly spend cap reached ($418.52 / $400.00)', triggered_by: 'automated_guardrail' }),
      created_at: new Date(now.getTime() - 14 * 3600 * 1000).toISOString()
    },
    {
      id: 'aud_002',
      org_id: orgId,
      project_id: 'proj_research',
      actor_name: 'Sarah Chen',
      actor_email: 'sarah.chen@apexai.io',
      action: 'BUDGET_UPDATED',
      resource_type: 'PROJECT',
      resource_id: 'proj_research',
      metadata_json: JSON.stringify({ previous_budget: 1800, new_budget: 2500, note: 'Approved Q3 synthetic data scaling' }),
      created_at: new Date(now.getTime() - 50 * 3600 * 1000).toISOString()
    },
    {
      id: 'aud_003',
      org_id: orgId,
      project_id: 'proj_copilot',
      actor_name: 'Alex Rivera',
      actor_email: 'alex.rivera@apexai.io',
      action: 'KEY_ROTATED',
      resource_type: 'PROVIDER_API_KEY',
      resource_id: 'pkey_oai_proj_copilot',
      metadata_json: JSON.stringify({ provider: 'OPENAI', key_name: 'Production OpenAI Key', prefix: 'sk-proj-9A...' }),
      created_at: new Date(now.getTime() - 72 * 3600 * 1000).toISOString()
    }
  ];

  return {
    organizations,
    users,
    projects,
    provider_api_keys,
    gateway_api_keys,
    requests,
    budget_alerts,
    alert_configs,
    audit_logs
  };
}

/**
 * Universal Store Interface matching prepared statements API
 */
class SpendGuardStore {
  private state: StoreState;

  constructor() {
    this.state = loadState();
  }

  pragma(_cmd: string) {
    // no-op for compatibility
  }

  exec(_sql: string) {
    // no-op for compatibility
  }

  prepare(sql: string) {
    const s = sql.trim();
    const state = this.state;
    const self = this;

    return {
      run(...params: any[]) {
        self.executeWrite(s, params);
        saveState(state);
        return { changes: 1 };
      },
      get(...params: any[]) {
        const rows = self.executeRead(s, params);
        return rows[0] || null;
      },
      all(...params: any[]) {
        return self.executeRead(s, params);
      }
    };
  }

  private executeWrite(sql: string, params: any[]) {
    const upper = sql.toUpperCase();
    
    // INSERT INTO requests
    if (upper.includes('INSERT INTO REQUESTS')) {
      const [id, project_id, user_id, provider, model, tokens_in, tokens_out, total_tokens, cost_estimate, latency_ms, status_code, is_anomaly, anomaly_reason, is_blocked, prompt_preview, response_preview, metadata_json, created_at] = params;
      this.state.requests.unshift({
        id,
        project_id,
        user_id,
        provider,
        model,
        tokens_in: Number(tokens_in),
        tokens_out: Number(tokens_out),
        total_tokens: Number(total_tokens),
        cost_estimate: Number(cost_estimate),
        latency_ms: Number(latency_ms),
        status_code: Number(status_code),
        is_anomaly: Number(is_anomaly),
        anomaly_reason,
        is_blocked: Number(is_blocked),
        prompt_preview,
        response_preview,
        metadata_json,
        created_at: created_at || new Date().toISOString()
      });
      return;
    }

    // INSERT INTO projects
    if (upper.includes('INSERT INTO PROJECTS')) {
      const [id, org_id, name, slug, description, budget_monthly, budget_weekly, budget_hard_block_enabled, is_blocked] = params;
      this.state.projects.push({
        id, org_id, name, slug, description, budget_monthly: Number(budget_monthly), budget_weekly: Number(budget_weekly),
        budget_hard_block_enabled: Number(budget_hard_block_enabled), is_blocked: Number(is_blocked), block_reason: null,
        created_at: new Date().toISOString()
      });
      return;
    }

    // UPDATE projects
    if (upper.includes('UPDATE PROJECTS')) {
      if (upper.includes('SET BUDGET_MONTHLY')) {
        const [budget_monthly, budget_weekly, budget_hard_block_enabled, is_blocked, block_reason, id] = params;
        const p = this.state.projects.find(x => x.id === id);
        if (p) {
          p.budget_monthly = Number(budget_monthly);
          p.budget_weekly = Number(budget_weekly);
          p.budget_hard_block_enabled = Number(budget_hard_block_enabled);
          p.is_blocked = Number(is_blocked);
          p.block_reason = block_reason;
        }
      } else if (upper.includes('SET IS_BLOCKED')) {
        const [block_reason, id] = params;
        const p = this.state.projects.find(x => x.id === id);
        if (p) {
          p.is_blocked = 1;
          p.block_reason = block_reason;
        }
      }
      return;
    }

    // INSERT INTO provider_api_keys
    if (upper.includes('INSERT INTO PROVIDER_API_KEYS')) {
      const [id, project_id, provider, key_name, key_prefix, encrypted_key, is_active] = params;
      this.state.provider_api_keys.push({
        id, project_id, provider, key_name, key_prefix, encrypted_key, is_active: Number(is_active),
        created_at: new Date().toISOString()
      });
      return;
    }

    // DELETE FROM provider_api_keys
    if (upper.includes('DELETE FROM PROVIDER_API_KEYS')) {
      const [id] = params;
      this.state.provider_api_keys = this.state.provider_api_keys.filter(k => k.id !== id);
      return;
    }

    // INSERT INTO gateway_api_keys
    if (upper.includes('INSERT INTO GATEWAY_API_KEYS')) {
      const [id, project_id, key_name, key_prefix, hashed_secret, rate_limit_rpm, is_active] = params;
      this.state.gateway_api_keys.push({
        id, project_id, key_name, key_prefix, hashed_secret, rate_limit_rpm: Number(rate_limit_rpm), is_active: Number(is_active),
        created_at: new Date().toISOString()
      });
      return;
    }

    // DELETE FROM gateway_api_keys
    if (upper.includes('DELETE FROM GATEWAY_API_KEYS')) {
      const [id] = params;
      this.state.gateway_api_keys = this.state.gateway_api_keys.filter(k => k.id !== id);
      return;
    }

    // INSERT INTO budget_alerts
    if (upper.includes('INSERT INTO BUDGET_ALERTS')) {
      const [id, project_id, threshold_type, threshold_value, channel, title, message] = params;
      this.state.budget_alerts.unshift({
        id, project_id, threshold_type, threshold_value: Number(threshold_value), channel, title, message,
        is_read: 0, status: 'SENT', triggered_at: new Date().toISOString()
      });
      return;
    }

    // UPDATE budget_alerts
    if (upper.includes('UPDATE BUDGET_ALERTS')) {
      if (upper.includes('SET IS_READ = 1') && params.length === 0) {
        this.state.budget_alerts.forEach(a => a.is_read = 1);
      } else {
        const [is_read, id] = params;
        const a = this.state.budget_alerts.find(x => x.id === id);
        if (a) a.is_read = Number(is_read);
      }
      return;
    }

    // INSERT INTO audit_logs
    if (upper.includes('INSERT INTO AUDIT_LOGS')) {
      const [id, org_id, project_id, actor_name, actor_email, action, resource_type, resource_id, metadata_json] = params;
      this.state.audit_logs.unshift({
        id, org_id, project_id, actor_name, actor_email, action, resource_type, resource_id, metadata_json,
        created_at: new Date().toISOString()
      });
      return;
    }

    // INSERT INTO users
    if (upper.includes('INSERT INTO USERS')) {
      const [id, org_id, name, email, role, avatar_url] = params;
      this.state.users.push({ id, org_id, name, email, role, avatar_url, created_at: new Date().toISOString() });
      return;
    }

    // UPDATE users
    if (upper.includes('UPDATE USERS')) {
      const [role, id] = params;
      const u = this.state.users.find(x => x.id === id);
      if (u) u.role = role;
      return;
    }
  }

  private executeRead(sql: string, params: any[]): any[] {
    const upper = sql.toUpperCase();

    // SELECT * FROM organizations
    if (upper.includes('FROM ORGANIZATIONS')) {
      return this.state.organizations;
    }

    // SELECT * FROM users
    if (upper.includes('FROM USERS')) {
      if (upper.includes('WHERE ID = ?')) {
        return this.state.users.filter(u => u.id === params[0]);
      }
      return this.state.users;
    }

    // SELECT * FROM projects
    if (upper.includes('FROM PROJECTS')) {
      if (upper.includes('WHERE ID = ?')) {
        return this.state.projects.filter(p => p.id === params[0]);
      }
      if (upper.includes('WHERE IS_BLOCKED = 0')) {
        return this.state.projects.filter(p => !p.is_blocked);
      }
      return this.state.projects.map(p => {
        const org = this.state.organizations.find(o => o.id === p.org_id);
        return { ...p, org_name: org?.name || 'Apex Innovations Inc.' };
      });
    }

    // Spend calculations in requests table
    if (upper.includes('FROM REQUESTS')) {
      let list = [...this.state.requests];

      // Filter by project_id
      if (upper.includes('PROJECT_ID = ?') || upper.includes('PROJECT_ID = \'')) {
        const pId = params[0] || (sql.match(/project_id = '([^']+)'/i)?.[1]);
        if (pId) {
          list = list.filter(r => r.project_id === pId);
        }
      }

      // Filter by created_at >= ?
      if (upper.includes('CREATED_AT >= ?') && params.length >= 2) {
        const timeLimit = new Date(params[1]).getTime();
        list = list.filter(r => new Date(r.created_at).getTime() >= timeLimit);
      }

      // Aggregate: SUM(cost_estimate), COUNT(*)
      if (upper.includes('SUM(COST_ESTIMATE)')) {
        const totalCost = list.reduce((sum, r) => sum + (r.cost_estimate || 0), 0);
        const totalTokens = list.reduce((sum, r) => sum + (r.total_tokens || 0), 0);
        const avgLatency = list.length > 0 ? list.reduce((sum, r) => sum + (r.latency_ms || 0), 0) / list.length : 0;
        return [{ totalCost, totalSpend: totalCost, totalReqs: list.length, totalRequests: list.length, totalTokens, avgLatency }];
      }

      // Aggregate: Anomaly count
      if (upper.includes('COUNT(*) AS ANOMALYCOUNT')) {
        const count = list.filter(r => r.is_anomaly).length;
        return [{ anomalyCount: count }];
      }

      // Aggregate: Blocked count
      if (upper.includes('COUNT(*) AS BLOCKEDCOUNT')) {
        const count = list.filter(r => r.is_blocked).length;
        return [{ blockedCount: count }];
      }

      // GROUP BY DATE(created_at)
      if (upper.includes('GROUP BY DATE(CREATED_AT)')) {
        const byDate: Record<string, { date: string; spend: number; tokens: number; requests: number }> = {};
        list.forEach(r => {
          const d = r.created_at.slice(0, 10);
          if (!byDate[d]) byDate[d] = { date: d, spend: 0, tokens: 0, requests: 0 };
          byDate[d].spend += r.cost_estimate;
          byDate[d].tokens += r.total_tokens;
          byDate[d].requests += 1;
        });
        return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
      }

      // GROUP BY model, provider
      if (upper.includes('GROUP BY MODEL, PROVIDER') || upper.includes('GROUP BY MODEL')) {
        const byModel: Record<string, any> = {};
        list.forEach(r => {
          if (!byModel[r.model]) {
            byModel[r.model] = { model: r.model, provider: r.provider, spend: 0, tokens: 0, requests: 0, totalLatency: 0 };
          }
          byModel[r.model].spend += r.cost_estimate;
          byModel[r.model].tokens += r.total_tokens;
          byModel[r.model].requests += 1;
          byModel[r.model].totalLatency += r.latency_ms;
        });
        return Object.values(byModel).map(m => ({
          ...m,
          avgLatency: m.requests > 0 ? Math.round(m.totalLatency / m.requests) : 0
        })).sort((a, b) => b.spend - a.spend);
      }

      // List of requests with joined project and user info
      return list.map(r => {
        const proj = this.state.projects.find(p => p.id === r.project_id);
        const usr = this.state.users.find(u => u.id === r.user_id);
        const totalTokens = Number(r.total_tokens ?? (Number(r.tokens_in || 0) + Number(r.tokens_out || 0)));
        const tokensIn = Number(r.tokens_in || 0);
        const tokensOut = Number(r.tokens_out || 0);
        const costEstimate = Number(r.cost_estimate || 0);
        const latencyMs = Number(r.latency_ms || 0);
        const statusCode = Number(r.status_code || 200);

        return {
          ...r,
          id: r.id,
          request_id: r.id,
          tokensIn,
          tokensOut,
          totalTokens,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          total_tokens: totalTokens,
          costEstimate,
          cost_estimate: costEstimate,
          latencyMs,
          latency_ms: latencyMs,
          statusCode,
          status_code: statusCode,
          isAnomaly: Boolean(r.is_anomaly),
          isBlocked: Boolean(r.is_blocked),
          is_anomaly: r.is_anomaly ? 1 : 0,
          is_blocked: r.is_blocked ? 1 : 0,
          anomaly_reason: r.anomaly_reason || '',
          promptPreview: r.prompt_preview || '',
          responsePreview: r.response_preview || '',
          timestamp: r.created_at || new Date().toISOString(),
          created_at: r.created_at || new Date().toISOString(),
          projectName: proj?.name || r.project_id,
          project_name: proj?.name || r.project_id,
          userName: usr?.name || 'API Client',
          user_name: usr?.name || 'API Client',
          userEmail: usr?.email || 'api@spendguard.ai',
          user_email: usr?.email || 'api@spendguard.ai'
        };
      });
    }

    // Provider API Keys
    if (upper.includes('FROM PROVIDER_API_KEYS')) {
      let list = [...this.state.provider_api_keys];
      if (upper.includes('PROJECT_ID = ?') && upper.includes('PROVIDER = ?')) {
        return list.filter(k => k.project_id === params[0] && k.provider === params[1] && k.is_active);
      }
      if (params.length > 0) {
        list = list.filter(k => k.project_id === params[0]);
      }
      return list.map(k => {
        const proj = this.state.projects.find(p => p.id === k.project_id);
        return { ...k, project_name: proj?.name || k.project_id };
      });
    }

    // Gateway API Keys
    if (upper.includes('FROM GATEWAY_API_KEYS')) {
      let list = [...this.state.gateway_api_keys];
      if (upper.includes('HASHED_SECRET = ?')) {
        return list.filter(k => k.hashed_secret === params[0]);
      }
      if (params.length > 0) {
        list = list.filter(k => k.project_id === params[0]);
      }
      return list.map(k => {
        const proj = this.state.projects.find(p => p.id === k.project_id);
        return { ...k, project_name: proj?.name || k.project_id };
      });
    }

    // Budget Alerts
    if (upper.includes('FROM BUDGET_ALERTS')) {
      let list = [...this.state.budget_alerts];
      if (upper.includes('THRESHOLD_TYPE = ?')) {
        const [projId, tType] = params;
        list = list.filter(a => a.project_id === projId && a.threshold_type === tType);
      } else if (params.length > 0 && params[0]) {
        list = list.filter(a => a.project_id === params[0]);
      }
      return list.map(a => {
        const proj = this.state.projects.find(p => p.id === a.project_id);
        return { ...a, project_name: proj?.name || a.project_id };
      });
    }

    // Audit Logs
    if (upper.includes('FROM AUDIT_LOGS')) {
      let list = [...this.state.audit_logs];
      if (params.length > 0 && typeof params[0] === 'string' && params[0].startsWith('proj_')) {
        list = list.filter(a => a.project_id === params[0]);
      }
      return list.map(a => {
        const proj = this.state.projects.find(p => p.id === a.project_id);
        return { ...a, project_name: proj?.name || a.project_id };
      });
    }

    return [];
  }
}

let storeInstance: SpendGuardStore | null = null;

export function getDb(): any {
  if (!storeInstance) {
    storeInstance = new SpendGuardStore();
  }
  return storeInstance;
}
