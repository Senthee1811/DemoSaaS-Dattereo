import { AlertDeliveryProcessor } from '../src/modules/alerts/alert-delivery.processor';
import { AlertDispatchService } from '../src/modules/alerts/alert-dispatch.service';
import { AlertsService } from '../src/modules/alerts/alerts.service';
import { fakeTransport } from './helpers/fake-transport';
import { buildAlertBlocks, isValidSlackWebhookUrl } from '../src/modules/alerts/slack-blocks';

const WEBHOOK = 'https://hooks.slack.com/services/T000/B000/XXXXXXXX';

function fakePrisma(overrides: Record<string, any> = {}) {
  const updates: any[] = [];
  const created: any[] = [];
  const prisma: any = {
    project: {
      findUnique: jest.fn(async () => ({
        name: 'Copilot',
        alertConfig: { slackWebhookUrl: 'enc:webhook', notifyOnAnomaly: true },
      })),
    },
    budgetAlert: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: 'a1', triggeredAt: new Date('2026-11-23T10:00:00Z'), ...data };
        created.push(row);
        return row;
      }),
      update: jest.fn(async (args: any) => {
        updates.push(args);
        return { id: args.where.id, ...args.data };
      }),
      findFirst: jest.fn(async () => null),
    },
    alertConfig: {
      findUnique: jest.fn(async () => ({ slackWebhookUrl: 'enc:webhook' })),
      upsert: jest.fn(async () => ({})),
    },
    ...overrides,
  };
  return { prisma, updates, created };
}

const encryption = {
  decryptApiKey: jest.fn(() => WEBHOOK),
  encryptApiKey: jest.fn((s: string) => `enc:${Buffer.from(s).toString('base64')}`),
};

const job = (attemptsMade = 0, attempts = 3): any => ({
  data: { alertId: 'a1', projectId: 'p1', blocks: [{ type: 'section' }] },
  attemptsMade,
  opts: { attempts },
});

afterEach(() => {
  jest.clearAllMocks();
});

const PUBLIC_RESOLVER = async () => ['93.184.216.34'];
function processorWith(prisma: any, behaviour: any = 200) {
  const t = fakeTransport(behaviour);
  const p = new AlertDeliveryProcessor(prisma, encryption as any);
  p.resolver = PUBLIC_RESOLVER;
  p.requestImpl = t.impl;
  return { p, t };
}

describe('AlertDeliveryProcessor', () => {
  it('marks SENT only after a 2xx from Slack, and posts the blocks', async () => {
    const { prisma, updates } = fakePrisma();
    const { p, t } = processorWith(prisma, 200);

    await p.process(job());

    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].options.hostname).toBe('hooks.slack.com');
    expect(t.calls[0].options.path).toBe('/services/T000/B000/XXXXXXXX');
    expect(t.calls[0].lookedUp).toBe('93.184.216.34'); // pinned to the validated address
    expect(JSON.parse(t.calls[0].body)).toEqual({ blocks: [{ type: 'section' }] });
    expect(updates).toHaveLength(1);
    expect(updates[0].data.status).toBe('SENT');
    expect(updates[0].data.deliveredAt).toBeInstanceOf(Date);
  });

  it('a failed attempt with retries left is rethrown and the row is NOT marked yet', async () => {
    const { prisma, updates } = fakePrisma();
    const { p } = processorWith(prisma, 404);

    await expect(p.process(job(0))).rejects.toThrow('Slack responded 404');
    expect(updates).toHaveLength(0);
  });

  it('marks FAILED with the error once retries are exhausted', async () => {
    const { prisma, updates } = fakePrisma();
    const { p } = processorWith(prisma, 404);

    await expect(p.process(job(2))).rejects.toThrow();
    expect(updates).toHaveLength(1);
    expect(updates[0].data.status).toBe('FAILED');
    expect(updates[0].data.deliveryError).toContain('404');
    expect(JSON.stringify(updates)).not.toContain('hooks.slack.com');
  });

  it('a network error never leaks the webhook URL into the stored error', async () => {
    const { prisma, updates } = fakePrisma();
    const { p } = processorWith(prisma, new Error(`connect ECONNREFUSED ${WEBHOOK}`));

    await expect(p.process(job(2))).rejects.toThrow();
    expect(updates[0].data.status).toBe('FAILED');
    expect(updates[0].data.deliveryError).toBe('Could not reach Slack');
  });

  it('webhook removed before delivery → FAILED, no HTTP call', async () => {
    const { prisma, updates } = fakePrisma();
    prisma.alertConfig.findUnique = jest.fn(async () => ({ slackWebhookUrl: null }));
    const { p, t } = processorWith(prisma);

    await expect(p.process(job(2))).rejects.toThrow();
    expect(t.calls).toHaveLength(0);
    expect(updates[0].data.status).toBe('FAILED');
  });
});

describe('AlertDeliveryProcessor outbound safety', () => {
  it('a Slack URL whose host now resolves internally is never connected to', async () => {
    const { prisma, updates } = fakePrisma();
    const { p, t } = processorWith(prisma);
    p.resolver = async () => ['10.0.0.9'];
    await expect(p.process(job(2))).rejects.toThrow(/rejected by the outbound safety check/);
    expect(t.calls).toHaveLength(0);
    expect(updates[0].data.status).toBe('FAILED');
  });
});

describe('AlertDispatchService', () => {
  const params = { projectId: 'p1', thresholdType: 'HARD_BLOCK' as const, thresholdValue: 50, title: 'T', message: 'M' };

  it('with a webhook: creates QUEUED (never SENT), queues the job with the secret kept out of Redis', async () => {
    const { prisma, created, updates } = fakePrisma();
    const queue = { add: jest.fn(async () => undefined) };

    const alert = await new AlertDispatchService(prisma, queue as any).dispatch(params);

    expect(created[0].status).toBe('QUEUED');
    expect(created[0].channel).toBe('SLACK');
    expect(alert.status).toBe('QUEUED');
    expect(updates).toHaveLength(0); // nothing sets SENT synchronously
    const [, data, opts] = queue.add.mock.calls[0] as unknown as [string, any, any];
    expect(opts).toMatchObject({ attempts: 3, backoff: { type: 'exponential', delay: 5000 }, jobId: 'a1' });
    expect(JSON.stringify(data)).not.toMatch(/hooks\.slack|enc:webhook/);
    expect(data.blocks[0].type).toBe('section');
    expect(data.blocks[1].type).toBe('context');
  });

  it('without a webhook: IN_APP, nothing queued', async () => {
    const { prisma, created } = fakePrisma();
    prisma.project.findUnique = jest.fn(async () => ({ name: 'Copilot', alertConfig: null }));
    const queue = { add: jest.fn() };

    await new AlertDispatchService(prisma, queue as any).dispatch(params);

    expect(created[0].status).toBe('IN_APP');
    expect(created[0].channel).toBe('IN_APP');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('queue unavailable: the row becomes FAILED, never stuck at QUEUED', async () => {
    const { prisma, updates } = fakePrisma();
    const queue = { add: jest.fn(async () => { throw new Error('redis down'); }) };

    const alert = await new AlertDispatchService(prisma, queue as any).dispatch(params);

    expect(updates[0].data.status).toBe('FAILED');
    expect(alert.status).toBe('FAILED');
  });

  it('anomaly alerts skip Slack when notifyOnAnomaly is off', async () => {
    const { prisma, created } = fakePrisma();
    prisma.project.findUnique = jest.fn(async () => ({ name: 'C', alertConfig: { slackWebhookUrl: 'enc', notifyOnAnomaly: false } }));
    const queue = { add: jest.fn() };

    await new AlertDispatchService(prisma, queue as any).dispatch({ ...params, thresholdType: 'ANOMALY_DETECTED' });

    expect(created[0].status).toBe('IN_APP');
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe('AlertsService Slack config', () => {
  const orgProject = { id: 'p1', name: 'Copilot', budgetMonthly: 100 };
  const svcWith = (prisma: any, dispatcher: any = {}) => new AlertsService(prisma, encryption as any, dispatcher);

  it('stores the webhook encrypted, and GET never returns the URL', async () => {
    const { prisma } = fakePrisma();
    prisma.project.findFirst = jest.fn(async () => orgProject);

    const res: any = await svcWith(prisma).setSlackWebhook('o1', 'p1', WEBHOOK);

    const stored = prisma.alertConfig.upsert.mock.calls[0][0].update.slackWebhookUrl;
    expect(stored).not.toContain('hooks.slack.com');
    expect(encryption.encryptApiKey).toHaveBeenCalledWith(WEBHOOK);
    expect(JSON.stringify(res)).not.toMatch(/hooks\.slack|enc:/);
    expect(res.slackUrlSaved).toBe(true);
  });

  it('"Configured" requires a saved URL AND a successful last send', async () => {
    const { prisma } = fakePrisma();
    prisma.project.findFirst = jest.fn(async () => orgProject);
    const svc = svcWith(prisma);

    prisma.budgetAlert.findFirst = jest.fn(async () => null);
    expect((await svc.getConfig('o1', 'p1')).slackConfigured).toBe(false); // saved, never sent

    prisma.budgetAlert.findFirst = jest.fn(async () => ({ status: 'QUEUED', deliveryError: null }));
    expect((await svc.getConfig('o1', 'p1')).slackConfigured).toBe(false);

    prisma.budgetAlert.findFirst = jest.fn(async () => ({ status: 'FAILED', deliveryError: 'Slack responded 404' }));
    const failed = await svc.getConfig('o1', 'p1');
    expect(failed.slackConfigured).toBe(false);
    expect(failed.lastSlackError).toBe('Slack responded 404');

    prisma.budgetAlert.findFirst = jest.fn(async () => ({ status: 'SENT', deliveryError: null }));
    expect((await svc.getConfig('o1', 'p1')).slackConfigured).toBe(true);
  });

  it('rejects non-Slack URLs and clears with null', async () => {
    const { prisma } = fakePrisma();
    prisma.project.findFirst = jest.fn(async () => orgProject);
    const svc = svcWith(prisma);

    await expect(svc.setSlackWebhook('o1', 'p1', 'https://evil.example.com/services/T/B/X')).rejects.toThrow('Slack Incoming Webhook');
    await expect(svc.setSlackWebhook('o1', 'p1', 'http://169.254.169.254/latest')).rejects.toThrow();

    await svc.setSlackWebhook('o1', 'p1', null);
    expect(prisma.alertConfig.upsert.mock.calls.at(-1)![0].update.slackWebhookUrl).toBeNull();
  });

  it('test alert goes through the dispatcher and is never marked SENT by the service', async () => {
    const { prisma } = fakePrisma();
    prisma.project.findFirst = jest.fn(async () => orgProject);
    const dispatcher = { dispatch: jest.fn(async (p: any) => ({ id: 'a9', status: 'QUEUED', ...p })) };

    const res: any = await svcWith(prisma, dispatcher).triggerTestAlert('o1', { projectId: 'p1', thresholdType: 'ANOMALY_DETECTED' });

    expect(res.alert.status).toBe('QUEUED');
    const sent = dispatcher.dispatch.mock.calls[0][0] as any;
    expect(sent.title).toMatch(/^\[TEST\]/);
    expect(sent.message).not.toMatch(/3\.4x|7-day average/);
  });
});

describe('10.8 the test alert (feed row and Slack payload) names the project it was requested for', () => {
  it('requested for "Ai Chatbot" → the alert and the queued Slack blocks reference Ai Chatbot, not another project', async () => {
    const { prisma, created } = fakePrisma();
    const requested = { id: 'proj-ai-chatbot', name: 'Ai Chatbot', budgetMonthly: 100 };
    prisma.project.findFirst = jest.fn(async ({ where }: any) => (where.id === requested.id ? requested : null));
    prisma.project.findUnique = jest.fn(async ({ where }: any) =>
      where.id === requested.id ? { name: requested.name, alertConfig: { slackWebhookUrl: 'enc:webhook', notifyOnAnomaly: true } } : null,
    );
    const queue = { add: jest.fn(async () => undefined) };
    const svc = new AlertsService(prisma, encryption as any, new AlertDispatchService(prisma, queue as any));

    await svc.triggerTestAlert('o1', { projectId: requested.id, thresholdType: 'PERCENT_80' });

    expect(created[0].projectId).toBe('proj-ai-chatbot');
    expect(created[0].title).toContain('Ai Chatbot');
    expect(created[0].message).toContain('Ai Chatbot');
    const [, job] = queue.add.mock.calls[0] as unknown as [string, any];
    expect(job.projectId).toBe('proj-ai-chatbot');
    expect(JSON.stringify(job.blocks)).toContain('Ai Chatbot');
    expect(JSON.stringify(job.blocks)).not.toContain('ProductionA');
  });

  it('a project from another organization is rejected, never alerted', async () => {
    const { prisma } = fakePrisma();
    prisma.project.findFirst = jest.fn(async () => null);
    const queue = { add: jest.fn() };
    const svc = new AlertsService(prisma, encryption as any, new AlertDispatchService(prisma, queue as any));
    await expect(svc.triggerTestAlert('o1', { projectId: 'someone-elses', thresholdType: 'PERCENT_80' })).rejects.toThrow('Project not found');
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe('slack-blocks', () => {
  it('builds section + context blocks from real values and escapes mrkdwn', () => {
    const blocks: any[] = buildAlertBlocks({
      title: 'Cap <hit>',
      message: 'Spent $4.20 of $5.00 & more',
      projectName: 'Copilot',
      thresholdType: 'PERCENT_80',
      triggeredAt: new Date('2026-11-23T10:00:00Z'),
    });
    expect(blocks.map((b) => b.type)).toEqual(['section', 'context']);
    expect(blocks[0].text.text).toContain('Cap &lt;hit&gt;');
    expect(blocks[0].text.text).toContain('$4.20 of $5.00 &amp; more');
    expect(blocks[1].elements[0].text).toContain('Copilot');
  });

  it('only accepts Slack webhook URLs (local test hosts outside production only)', () => {
    expect(isValidSlackWebhookUrl(WEBHOOK)).toBe(true);
    expect(isValidSlackWebhookUrl('https://hooks.slack.com.evil.io/services/T/B/X')).toBe(false);
    expect(isValidSlackWebhookUrl('http://hooks.slack.com/services/T/B/X')).toBe(false);
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    expect(isValidSlackWebhookUrl('http://127.0.0.1:9999/ok')).toBe(true);
    process.env.NODE_ENV = 'production';
    expect(isValidSlackWebhookUrl('http://127.0.0.1:9999/ok')).toBe(false);
    process.env.NODE_ENV = prev;
  });
});
