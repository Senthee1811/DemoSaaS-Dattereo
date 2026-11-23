import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface SessionView {
  id: string;
  device: string;
  ip: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  current: boolean;
}

/** An access token outlives a revoked session by at most this long, so we flag the session this long. */
const ACCESS_TOKEN_GRACE_SECONDS = 20 * 60;

/** '7d' | '12h' | '30m' | '3600' → seconds. Anything unparseable falls back to 7 days. */
export function expiryToSeconds(value: string | undefined): number {
  const m = /^(\d+)\s*([smhd]?)$/.exec((value || '7d').trim());
  if (!m) return 7 * 86400;
  const n = Number(m[1]);
  return n * ({ s: 1, m: 60, h: 3600, d: 86400, '': 1 } as Record<string, number>)[m[2]];
}

/** "Chrome on Windows". Best-effort from the User-Agent; never stores anything beyond that label. */
export function describeDevice(userAgent?: string | null): string {
  const ua = userAgent || '';
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /curl\//i.test(ua)
              ? 'curl'
              : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  return os ? `${browser} on ${os}` : browser;
}

/**
 * Session tracking. The refresh token carries a session id (`sid`); this is what makes "sign out
 * that device" real: a revoked session cannot refresh, and its access token is refused within
 * moments (Redis flag) instead of living out its 15 minutes.
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  private flagKey(sid: string) {
    return `spendguard:sid_revoked:${sid}`;
  }

  async create(userId: string, meta: SessionMeta = {}): Promise<string> {
    const ttl = expiryToSeconds(this.configService.get<string>('jwt.refreshExpiration'));
    const session = await this.prisma.userSession.create({
      data: {
        userId,
        userAgent: meta.userAgent ? meta.userAgent.slice(0, 255) : null,
        ip: meta.ip ? meta.ip.slice(0, 64) : null,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
      select: { id: true },
    });
    return session.id;
  }

  /**
   * Called on every refresh: 'ok' (and records the use), 'revoked' (revoked or expired), or
   * 'unknown' (a token issued before sessions existed: the caller should adopt it).
   */
  async checkForRefresh(sid: string, userId: string): Promise<'ok' | 'revoked' | 'unknown'> {
    const row = await this.prisma.userSession.findFirst({ where: { id: sid, userId } });
    if (!row) return 'unknown';
    if (row.revokedAt || row.expiresAt.getTime() <= Date.now()) return 'revoked';
    await this.prisma.userSession.update({ where: { id: sid }, data: { lastUsedAt: new Date() } });
    return 'ok';
  }

  /** Fast path for every authenticated request. Fails open: the DB check on refresh still holds. */
  async isRevoked(sid: string | undefined): Promise<boolean> {
    if (!sid) return false;
    const client = this.redisService.getClient();
    if (!client) return false;
    try {
      return (await client.exists(this.flagKey(sid))) === 1;
    } catch {
      return false;
    }
  }

  private async flag(sids: string[]) {
    const client = this.redisService.getClient();
    if (!client || sids.length === 0) return;
    try {
      await Promise.all(sids.map((sid) => client.set(this.flagKey(sid), '1', 'EX', ACCESS_TOKEN_GRACE_SECONDS)));
    } catch (err: any) {
      this.logger.warn(`Could not flag revoked sessions in Redis (they still cannot refresh): ${err?.message}`);
    }
  }

  async list(userId: string, currentSid?: string): Promise<SessionView[]> {
    const rows = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      device: describeDevice(r.userAgent),
      ip: r.ip,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      expiresAt: r.expiresAt,
      current: r.id === currentSid,
    }));
  }

  async count(userId: string): Promise<number> {
    return this.prisma.userSession.count({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } } });
  }

  /** Revokes one of the caller's own sessions. Another user's session id is simply "not found". */
  async revokeOne(userId: string, sid: string, currentSid: string | undefined, confirmCurrent: boolean) {
    const row = await this.prisma.userSession.findFirst({ where: { id: sid, userId, revokedAt: null } });
    if (!row) throw new NotFoundException('Session not found');
    if (sid === currentSid && !confirmCurrent) {
      throw new ConflictException({
        error: {
          message: 'This is the session you are using now. Revoking it signs you out here. Confirm to continue.',
          type: 'conflict',
          code: 'current_session',
        },
      });
    }
    await this.prisma.userSession.update({ where: { id: sid }, data: { revokedAt: new Date() } });
    await this.flag([sid]);
    return { revokedCurrent: sid === currentSid };
  }

  /** Revokes every session of the user except `exceptSid`. Returns how many were revoked. */
  async revokeAllExcept(userId: string, exceptSid: string | undefined): Promise<number> {
    const rows = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, ...(exceptSid ? { id: { not: exceptSid } } : {}) },
      select: { id: true },
    });
    if (rows.length === 0) return 0;
    const ids = rows.map((r) => r.id);
    await this.prisma.userSession.updateMany({ where: { id: { in: ids } }, data: { revokedAt: new Date() } });
    await this.flag(ids);
    return ids.length;
  }

  /** Used by logout. Quietly does nothing for an unknown id. */
  async revokeIfExists(userId: string, sid: string) {
    const res = await this.prisma.userSession.updateMany({ where: { id: sid, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (res.count > 0) await this.flag([sid]);
  }
}
