import { randomUUID } from 'crypto';
import { matches, Row } from './fakes';

/** In-memory notification tables with the Prisma behaviours the code relies on (unique (channelId,eventId) → P2002, filters). */
export class FakeNotificationDb {
  channels: Row[] = [];
  deliveries: Row[] = [];
  failDeliveryCreate = false;
  auditRows: Row[] = [];
  failAudit = false;

  auditLog = {
    create: async ({ data }: any) => {
      if (this.failAudit) throw new Error('audit db down');
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.auditRows.push(row);
      return row;
    },
    findMany: async ({ where }: any) =>
      this.auditRows
        .filter((r) => r.orgId === where.orgId && String(r.action).startsWith(where.action.startsWith))
        .sort((a, b) => b.createdAt - a.createdAt),
  };

  private hasEventTypeFilter(r: Row, where: Row): boolean {
    if (!where.OR) return true;
    return where.OR.some((c: Row) => {
      if (c.eventTypes?.isEmpty) return r.eventTypes.length === 0;
      if (c.eventTypes?.has) return r.eventTypes.includes(c.eventTypes.has);
      return matches(r, c);
    });
  }

  notificationChannel = {
    findMany: async ({ where = {}, orderBy }: any = {}) => {
      const { OR, ...rest } = where;
      let rows = this.channels.filter((r) => matches(r, rest) && this.hasEventTypeFilter(r, { OR }));
      if (orderBy?.createdAt === 'asc') rows = rows.sort((a, b) => a.createdAt - b.createdAt);
      return rows.map((r) => ({ ...r }));
    },
    findFirst: async ({ where }: any) => this.channels.find((r) => matches(r, where)) ?? null,
    count: async ({ where }: any) => this.channels.filter((r) => matches(r, where)).length,
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), enabled: true, eventTypes: [], configHint: null, createdById: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      this.channels.push(row);
      return { ...row };
    },
    update: async ({ where, data }: any) => {
      const row = this.channels.find((r) => r.id === where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
    delete: async ({ where }: any) => {
      this.channels = this.channels.filter((r) => r.id !== where.id);
      this.deliveries.filter((d) => d.channelId === where.id).forEach((d) => (d.channelId = null)); // ON DELETE SET NULL
      return {};
    },
  };

  notificationDelivery = {
    create: async ({ data }: any) => {
      if (this.failDeliveryCreate) throw new Error('db down');
      if (data.channelId && this.deliveries.some((d) => d.channelId === data.channelId && d.eventId === data.eventId)) throw Object.assign(new Error('unique'), { code: 'P2002' });
      const row = { id: randomUUID(), attempts: 0, lastError: null, lastAttemptAt: null, deliveredAt: null, readAt: null, createdAt: new Date(), ...data };
      this.deliveries.push(row);
      return { ...row };
    },
    findFirst: async ({ where }: any) => this.deliveries.find((r) => matches(r, where)) ?? null,
    findUnique: async ({ where, include }: any) => {
      const d = this.deliveries.find((r) => r.id === where.id);
      if (!d) return null;
      return { ...d, ...(include?.channel ? { channel: this.channels.find((c) => c.id === d.channelId) ?? null } : {}) };
    },
    findMany: async ({ where = {}, orderBy, take, skip, include }: any = {}) => {
      const { OR, ...rest } = where;
      let rows = this.deliveries.filter((r) => matches(r, rest) && (!OR || OR.some((c: Row) => matches(r, c))));
      if (orderBy?.createdAt) rows = rows.sort((a, b) => (orderBy.createdAt === 'desc' ? -1 : 1) * (a.createdAt - b.createdAt));
      if (skip) rows = rows.slice(skip);
      if (take) rows = rows.slice(0, take);
      return rows.map((r) => ({ ...r, ...(include?.channel ? { channel: this.channels.find((c) => c.id === r.channelId) ? { name: this.channels.find((c) => c.id === r.channelId)!.name } : null } : {}) }));
    },
    count: async ({ where }: any) => this.deliveries.filter((r) => matches(r, where)).length,
    update: async ({ where, data }: any) => {
      const row = this.deliveries.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return { ...row };
    },
    updateMany: async ({ where, data }: any) => {
      const rows = this.deliveries.filter((r) => matches(r, where));
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    },
    groupBy: async ({ where }: any) => {
      const rows = this.deliveries.filter((r) => matches(r, where));
      const groups = new Map<string, Row>();
      for (const r of rows) {
        const k = `${r.channelId}|${r.status}`;
        const g = groups.get(k) ?? { channelId: r.channelId, status: r.status, _count: { id: 0 }, _max: { createdAt: r.createdAt } };
        g._count.id++;
        groups.set(k, g);
      }
      return [...groups.values()];
    },
  };
}

export const fakeEncryption = () => {
  // Reversible but opaque, so tests can prove the stored value is not the plaintext
  const enc = (s: string) => `enc:${Buffer.from(s).toString('base64').split('').reverse().join('')}`;
  const dec = (s: string) => Buffer.from(s.slice(4).split('').reverse().join(''), 'base64').toString();
  return { encryptApiKey: jest.fn(enc), decryptApiKey: jest.fn(dec) };
};
