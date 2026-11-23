import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { CreateProjectDto, UpdateProjectDto } from '../src/modules/organizations/organizations.dto';
import { CreateKeyDto } from '../src/modules/keys/keys.dto';
import { InviteMemberDto } from '../src/modules/team/team.dto';
import { MarkAlertsReadDto, TestAlertDto } from '../src/modules/alerts/alerts.dto';
import { GlobalHttpExceptionFilter } from '../src/common/filters/http-exception.filter';

const UUID = '3c66dcd5-9588-479c-ac9d-83c024ad1032';

/** Same options as the global ValidationPipe in main.ts. */
async function errorsFor(cls: any, body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true });
  return errors.map((e) => e.property);
}

describe('6.8 request validation', () => {
  describe('projects', () => {
    it.each([
      ['1e308 budget', { name: 'P', budgetMonthly: 1e308 }],
      ['negative budget', { name: 'P', budgetMonthly: -50 }],
      ['non-numeric budget', { name: 'P', budgetMonthly: 'abc' }],
      ['20,000-char name', { name: 'x'.repeat(20000) }],
      ['blank name', { name: '   ' }],
      ['unknown field', { name: 'P', isAdmin: true }],
    ])('create rejects %s', async (_label, body) => {
      expect(await errorsFor(CreateProjectDto, body)).not.toHaveLength(0);
    });

    it('create accepts a normal project and the smallest storable budget', async () => {
      expect(await errorsFor(CreateProjectDto, { name: 'Support Bot', budgetMonthly: 100 })).toEqual([]);
      expect(await errorsFor(CreateProjectDto, { name: 'Tiny', budgetMonthly: 0.0001 })).toEqual([]);
    });

    it('update rejects an empty name, a negative budget and a non-UUID id', async () => {
      expect(await errorsFor(UpdateProjectDto, { id: UUID, name: '' })).toContain('name');
      expect(await errorsFor(UpdateProjectDto, { id: UUID, budgetMonthly: -1 })).toContain('budgetMonthly');
      expect(await errorsFor(UpdateProjectDto, { id: 'nope' })).toContain('id');
    });
  });

  describe('keys', () => {
    const base = { type: 'GATEWAY', projectId: UUID, keyName: 'k' };
    it.each([
      ['negative RPM', { rateLimitRpm: -5 }],
      ['zero TPM', { rateLimitTpm: 0 }],
      ['negative key budget', { budgetMonthly: -1 }],
      ['allowedModels as a string (used to disable the restriction)', { allowedModels: 'gpt-4o' }],
      ['unknown provider in allowedProviders', { allowedProviders: ['OPENAI', 'BANANA'] }],
      ['unparseable expiresAt', { expiresAt: 'not-a-date' }],
      ['20,000-char key name', { keyName: 'k'.repeat(20000) }],
      ['unknown key type', { type: 'FOO' }],
    ])('rejects %s', async (_label, extra) => {
      expect(await errorsFor(CreateKeyDto, { ...base, ...extra })).not.toHaveLength(0);
    });

    it('accepts what the Key Vault and onboarding send', async () => {
      expect(await errorsFor(CreateKeyDto, { ...base, environment: 'live', rateLimitRpm: 1200 })).toEqual([]);
      expect(
        await errorsFor(CreateKeyDto, { type: 'PROVIDER', projectId: UUID, provider: 'OPENAI', keyName: 'OPENAI Primary Key', plainKey: 'sk-x' }),
      ).toEqual([]);
      expect(await errorsFor(CreateKeyDto, { ...base, allowedModels: ['gpt-4o-mini'], expiresAt: '2030-01-01T00:00:00Z' })).toEqual([]);
    });
  });

  describe('team and alerts', () => {
    it('an invite cannot ask for OWNER (it used to be silently downgraded to MEMBER)', async () => {
      expect(await errorsFor(InviteMemberDto, { name: 'Eve', email: 'eve@x.co', role: 'OWNER' })).toContain('role');
      expect(await errorsFor(InviteMemberDto, { name: 'Eve', email: 'eve@x.co', role: 'MEMBER' })).toEqual([]);
    });

    it('mark-read only takes an alert UUID or markAllRead', async () => {
      expect(await errorsFor(MarkAlertsReadDto, { id: 'x' })).toContain('id');
      expect(await errorsFor(MarkAlertsReadDto, { id: UUID, isRead: true })).toContain('isRead');
      expect(await errorsFor(MarkAlertsReadDto, { markAllRead: true })).toEqual([]);
    });

    it('test alert: legacy "channel" is tolerated (ignored), other unknown fields are not', async () => {
      expect(await errorsFor(TestAlertDto, { projectId: UUID, channel: 'SLACK' })).toEqual([]);
      expect(await errorsFor(TestAlertDto, { projectId: UUID, webhook: 'http://x' })).toContain('webhook');
    });
  });

  describe('body parser errors', () => {
    const run = (exception: unknown) => {
      let status = 0;
      let body: any;
      const res = { status: (s: number) => ({ json: (b: any) => ((status = s), (body = b)) }) };
      const host = {
        switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ method: 'POST', url: '/x' }) }),
      } as unknown as ArgumentsHost;
      new GlobalHttpExceptionFilter().catch(exception, host);
      return { status, body };
    };

    it('an oversized body is 413, not 500', () => {
      const r = run(Object.assign(new Error('request entity too large'), { status: 413, expose: true, type: 'entity.too.large' }));
      expect(r.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
      expect(r.body.error.type).toBe('payload_too_large');
    });

    it('malformed JSON is 400, not 500', () => {
      const r = run(Object.assign(new SyntaxError('Unexpected token'), { status: 400, expose: true, type: 'entity.parse.failed' }));
      expect(r.status).toBe(400);
    });

    it('an unexpected error is still a generic 500 with no internal detail', () => {
      const r = run(new Error('relation "secret_table" does not exist'));
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.body)).not.toContain('secret_table');
    });
  });
});
