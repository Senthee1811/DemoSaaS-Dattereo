import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException, Logger, ServiceUnavailableException, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { EmailService } from '@/modules/email/email.service';
import { appUrl } from '@/common/app-url';
import { SessionsService, SessionMeta, describeDevice } from './sessions.service';
import { passwordPolicyProblems } from './password-policy';
import * as crypto from 'crypto';
import { promisify } from 'util';

const pbkdf2 = promisify(crypto.pbkdf2);

export interface RegisterDto {
  email: string;
  password: string;
  name: string;
  orgName?: string;
  orgSlug?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

export interface TokenPayload {
  sub: string;
  email: string;
  orgId: string;
  role: string;
  /** Session id: ties the token to a UserSession row so it can be revoked. */
  sid?: string;
}

/** Audit actions that make up a user's security activity (see securityActivity). */
export const SECURITY_EVENT_ACTIONS = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGOUT',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'SESSION_REVOKED',
  'OTHER_SESSIONS_REVOKED',
] as const;
export type SecurityEventAction = (typeof SECURITY_EVENT_ACTIONS)[number];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly emailService: EmailService,
    private readonly sessions: SessionsService,
  ) {}

  /**
   * Hash password using PBKDF2-SHA512 (async so it does not block the event loop).
   */
  async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = (await pbkdf2(password, salt, 100000, 64, 'sha512')).toString('hex');
    return `$pbkdf2$${salt}$${hash}`;
  }

  /**
   * Verify password against stored hash using a constant-time comparison.
   */
  private async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    if (storedHash.startsWith('$pbkdf2$')) {
      const parts = storedHash.split('$');
      const salt = parts[2];
      const hash = parts[3];
      if (!salt || !hash) return false;
      const derived = await pbkdf2(password, salt, 100000, 64, 'sha512');
      return this.safeEqualHex(derived.toString('hex'), hash);
    }
    // Fallback for seed data with different hash format
    if (storedHash.startsWith('$seed$')) {
      const seedHash = crypto.createHash('sha256').update(password).digest('hex');
      return this.safeEqualHex(seedHash, storedHash.slice('$seed$'.length));
    }
    return false;
  }

  private safeEqualHex(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    return bufA.length > 0 && bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  }

  private normalizeEmail(email: string): string {
    return (email || '').trim().toLowerCase();
  }

  /** Deactivation is persisted in Postgres; Redis only holds descriptive details. */
  private isDeactivated(user: { deactivatedAt: Date | null }): boolean {
    return Boolean(user.deactivatedAt);
  }

  /**
   * Generate access and refresh JWT tokens
   */
  private generateTokens(payload: TokenPayload): { accessToken: string; refreshToken: string } {
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: this.configService.get<string>('jwt.accessExpiration') || '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshExpiration') || '7d',
      // Unique per session, so revoking one session never revokes another issued in the same second
      jwtid: crypto.randomUUID(),
    });

    return { accessToken, refreshToken };
  }

  /**
   * Register a new user. Self-service sign-up ALWAYS creates a new, isolated
   * organization owned by the registrant — joining an existing organization
   * is only possible through a team invite issued by that organization.
   */
  async register(dto: RegisterDto, meta: SessionMeta = {}) {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await this.hashPassword(dto.password);

    const orgName = (dto.orgName || `${dto.name}'s Organization`).trim();
    const baseSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace';
    let orgSlug = baseSlug;
    while (await this.prisma.organization.findUnique({ where: { slug: orgSlug } })) {
      orgSlug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
    }

    const { org, user } = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: orgName, slug: orgSlug },
      });
      const user = await tx.user.create({
        data: {
          orgId: org.id,
          email,
          name: dto.name,
          passwordHash,
          role: 'OWNER',
        },
      });
      return { org, user };
    });

    const sid = await this.sessions.create(user.id, meta);
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      orgId: org.id,
      role: user.role,
      sid,
    };

    const tokens = this.generateTokens(payload);

    this.logger.log(`User registered: ${user.id} (${user.role}) in org ${org.id}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: org.id,
        orgName: org.name,
      },
      ...tokens,
    };
  }

  /**
   * Authenticate user with email/password
   */
  async login(dto: LoginDto, meta: SessionMeta = {}) {
    const user = await this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(dto.email) },
      include: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isValid = await this.verifyPassword(dto.password, user.passwordHash);
    if (!isValid) {
      // Recorded only for a real account (its owner sees failed attempts); never the password
      await this.recordSecurityEvent(user.email, user.id, 'LOGIN_FAILED', meta);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Only reveal deactivation status once the password has been proven
    if (this.isDeactivated(user)) {
      throw new UnauthorizedException('This account has been deactivated. Please contact your organization administrator or support to request reactivation.');
    }

    const sid = await this.sessions.create(user.id, meta);
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      orgId: user.orgId,
      role: user.role,
      sid,
    };

    const tokens = this.generateTokens(payload);
    await this.recordSecurityEvent(user.email, user.id, 'LOGIN_SUCCESS', meta);

    this.logger.log(`User logged in: ${user.id}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: user.orgId,
        orgName: user.organization?.name,
      },
      ...tokens,
    };
  }

  /** Redis key marking a refresh token as revoked (by hash: works for tokens issued before jti existed). */
  private revokedRefreshKey(refreshToken: string): string {
    return `spendguard:rt_revoked:${crypto.createHash('sha256').update(refreshToken).digest('hex')}`;
  }

  /**
   * Sign out: revokes the refresh token server-side until it would have expired.
   * Fails (503) rather than pretending when the revocation store is unavailable.
   * The short-lived access token (15m by default) is not revoked; it expires on its own.
   */
  async logout(refreshToken: string) {
    let payload: TokenPayload & { exp?: number };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        ignoreExpiration: true,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const ttl = (payload.exp ?? 0) - Math.floor(Date.now() / 1000);
    if (ttl <= 0) return { success: true, revoked: false }; // already expired: nothing left to revoke

    const client = this.redisService.getClient();
    if (!client) {
      throw new ServiceUnavailableException('Sign-out is temporarily unavailable. Please try again.');
    }
    try {
      await client.set(this.revokedRefreshKey(refreshToken), '1', 'EX', ttl);
    } catch {
      throw new ServiceUnavailableException('Sign-out is temporarily unavailable. Please try again.');
    }
    // The session itself is revoked too, so its other tokens (and its access token) stop working
    if (payload.sid) await this.sessions.revokeIfExists(payload.sub, payload.sid);
    await this.recordSecurityEvent(payload.email, payload.sub, 'LOGOUT', {});
    this.logger.log(`Refresh token revoked for user ${payload.sub}`);
    return { success: true, revoked: true };
  }

  /**
   * Refresh access token using refresh token
   */
  async refresh(refreshToken: string) {
    let payload: TokenPayload;
    try {
      payload = this.jwtService.verify<TokenPayload>(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Fail closed: a signed-out token must never be usable, so without the
    // revocation store there is no refresh (the user signs in again).
    const client = this.redisService.getClient();
    if (!client) throw new UnauthorizedException('Session could not be verified. Please sign in again.');
    let revoked = 0;
    try {
      revoked = await client.exists(this.revokedRefreshKey(refreshToken));
    } catch {
      throw new UnauthorizedException('Session could not be verified. Please sign in again.');
    }
    if (revoked) throw new UnauthorizedException('Invalid or expired refresh token');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || this.isDeactivated(user)) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // The session must still be live. A token from before sessions existed has no sid: adopt it
    // into a new session so it shows up (and can be revoked) like any other.
    let sid = payload.sid;
    if (sid) {
      const state = await this.sessions.checkForRefresh(sid, user.id);
      if (state === 'revoked') throw new UnauthorizedException('Invalid or expired refresh token');
      if (state === 'unknown') sid = await this.sessions.create(user.id);
    } else {
      sid = await this.sessions.create(user.id);
    }

    // Re-read role/org from DB so role changes take effect on refresh
    return this.generateTokens({
      sub: user.id,
      email: user.email,
      orgId: user.orgId,
      role: user.role,
      sid,
    });
  }

  /**
   * Validate JWT payload (used by JwtStrategy). Role and org are taken from
   * the database, not the token, so revocations/role changes apply immediately.
   */
  async validateUser(payload: TokenPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (this.isDeactivated(user)) {
      throw new UnauthorizedException('Account has been deactivated. Access revoked.');
    }

    // A revoked session's access token stops working now, not 15 minutes from now
    if (await this.sessions.isRevoked(payload.sid)) {
      throw new UnauthorizedException('This session was signed out.');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: user.orgId,
      sessionId: payload.sid,
    };
  }

  /**
   * Verifies a user access token outside the passport pipeline (e.g. the
   * gateway, which accepts either a gateway key or a dashboard session).
   * Returns null when the token is not a valid, active user session.
   */
  async verifyAccessToken(token: string) {
    try {
      const payload = this.jwtService.verify<TokenPayload>(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });
      return await this.validateUser(payload);
    } catch {
      return null;
    }
  }

  /**
   * Request password recovery token.
   * To prevent email enumeration, this returns a generic success message regardless of existence.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(dto.email) },
    });

    const generic = {
      success: true,
      message: 'If this email is associated with an account, instructions have been sent.',
    };

    if (!user) return generic;

    const resetToken = await this.issuePasswordToken(user.id, user.email, 3600);
    // Not awaited: response time must not reveal whether the account exists.
    // EmailService never throws. The token only ever travels by email.
    void this.emailService.sendPasswordReset(user.email, `${appUrl()}/forgot-password?token=${resetToken}`);

    return generic;
  }

  /**
   * Issues a one-time password-set token (used by reset and by team invites).
   */
  async issuePasswordToken(userId: string, email: string, ttlSeconds: number): Promise<string> {
    if (!this.redisService.isConnected) {
      throw new BadRequestException('Password token service is temporarily unavailable. Please try again shortly.');
    }
    const token = crypto.randomBytes(32).toString('hex');
    await this.redisService.setCache(
      `spendguard:pwd_reset:${token}`,
      JSON.stringify({ userId, email }),
      ttlSeconds,
    );
    return token;
  }

  /**
   * Reset password with valid time-limited one-time token.
   */
  async resetPassword(dto: ResetPasswordDto) {
    if (!dto.token || !dto.newPassword || dto.newPassword.length < 8) {
      throw new BadRequestException('Invalid token or password does not meet the minimum length (8 chars).');
    }

    const cachedData = await this.redisService.getCache(`spendguard:pwd_reset:${dto.token}`);
    if (!cachedData) {
      throw new BadRequestException('Password reset token is invalid, expired, or has already been used.');
    }

    // Invalidate first so a token can never be replayed, even on concurrent requests
    await this.redisService.delCache(`spendguard:pwd_reset:${dto.token}`);

    let parsed: { userId: string; email: string };
    try {
      parsed = JSON.parse(cachedData);
    } catch {
      throw new BadRequestException('Corrupt reset token payload.');
    }

    const newHash = await this.hashPassword(dto.newPassword);
    await this.prisma.user.update({
      where: { id: parsed.userId },
      data: { passwordHash: newHash, passwordChangedAt: new Date() },
    });
    // A reset means the old password may be compromised: every existing session ends
    await this.sessions.revokeAllExcept(parsed.userId, undefined);
    await this.recordSecurityEvent(parsed.email, parsed.userId, 'PASSWORD_RESET', {});

    this.logger.log(`Password successfully updated for user ${parsed.userId}.`);

    return {
      success: true,
      message: 'Your password has been reset successfully. Please log in with your new credentials.',
    };
  }

  // ───────────────────────────── Security workspace ─────────────────────────────

  /**
   * Writes one security event to the audit log. Never throws (a logging failure must not block
   * sign-in), never receives passwords or tokens, and stores only a coarse device label and IP.
   * actor = the account's email; metadata.userId ties it to the account.
   */
  private async recordSecurityEvent(actorEmail: string, userId: string, action: SecurityEventAction, meta: SessionMeta) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actor: actorEmail,
          action,
          metadata: JSON.stringify({
            userId,
            device: meta.userAgent ? describeDevice(meta.userAgent) : undefined,
            ip: meta.ip || undefined,
          }),
        },
      });
    } catch (err: any) {
      this.logger.error(`Could not record security event ${action}: ${err?.message}`);
    }
  }

  /**
   * Changes the signed-in user's password. The current password is verified server-side, the new
   * one must pass the policy, every OTHER session is signed out, and nothing sensitive is logged.
   * A wrong current password is 400 (never 401: the client treats 401 as "session expired").
   */
  async changePassword(
    actor: { id: string; sessionId?: string },
    dto: { currentPassword: string; newPassword: string },
    meta: SessionMeta = {},
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
    if (!user || this.isDeactivated(user)) throw new UnauthorizedException('Account not available.');

    // Limit guessing of the current password from a stolen session: 5 wrong tries per 15 minutes
    const failKey = `spendguard:pwchange_fail:${user.id}`;
    const client = this.redisService.getClient();
    if (client) {
      let failures = 0;
      try {
        failures = Number((await client.get(failKey)) || 0);
      } catch {
        /* Redis trouble: fail open */
      }
      if (failures >= 5) {
        throw new HttpException(
          { error: { message: 'Too many incorrect attempts. Try again in 15 minutes.', type: 'rate_limit_error', code: 'too_many_attempts' } },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const ok = await this.verifyPassword(dto.currentPassword || '', user.passwordHash);
    if (!ok) {
      if (client) {
        try {
          const n = await client.incr(failKey);
          if (n === 1) await client.expire(failKey, 15 * 60);
        } catch {
          /* fail open */
        }
      }
      throw new BadRequestException({
        error: { message: 'Your current password is incorrect.', type: 'invalid_request_error', code: 'invalid_current_password' },
      });
    }

    const problems = passwordPolicyProblems(dto.newPassword, dto.currentPassword);
    if (problems.length > 0) {
      throw new BadRequestException({
        error: { message: problems.join(' '), type: 'invalid_request_error', code: 'weak_password' },
      });
    }

    const passwordHash = await this.hashPassword(dto.newPassword);
    const changedAt = new Date();
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: changedAt } });
    if (client) {
      try {
        await client.del(failKey);
      } catch {
        /* ignore */
      }
    }

    const signedOut = await this.sessions.revokeAllExcept(user.id, actor.sessionId);
    await this.recordSecurityEvent(user.email, user.id, 'PASSWORD_CHANGED', meta);
    this.logger.log(`Password changed for user ${user.id}; ${signedOut} other session(s) signed out`);

    return { success: true, passwordChangedAt: changedAt.toISOString(), otherSessionsSignedOut: signedOut };
  }

  /** Real facts only: nothing here is a score or an estimate. */
  async securityOverview(actor: { id: string; sessionId?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: actor.id }, include: { organization: true } });
    if (!user) throw new UnauthorizedException();

    const [activeSessions, currentSession, lastFailed] = await Promise.all([
      this.sessions.count(user.id),
      actor.sessionId ? this.prisma.userSession.findFirst({ where: { id: actor.sessionId, userId: user.id } }) : Promise.resolve(null),
      this.prisma.auditLog.findFirst({
        where: { actor: user.email, action: 'LOGIN_FAILED' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      email: user.email,
      role: user.role,
      organization: user.organization?.name ?? null,
      accountCreatedAt: user.createdAt.toISOString(),
      password: {
        set: true,
        // null = not changed since the account was created (or changed before this was recorded)
        changedAt: user.passwordChangedAt ? user.passwordChangedAt.toISOString() : null,
      },
      sessions: {
        active: activeSessions,
        currentStartedAt: currentSession ? currentSession.createdAt.toISOString() : null,
        trackingAvailable: Boolean(actor.sessionId),
      },
      lastFailedSignInAt: lastFailed ? lastFailed.createdAt.toISOString() : null,
      // Multi-factor authentication is not implemented, so it is reported as unsupported, not "off"
      mfa: { supported: false },
    };
  }

  async listSessions(actor: { id: string; sessionId?: string }) {
    return { sessions: await this.sessions.list(actor.id, actor.sessionId), currentSessionKnown: Boolean(actor.sessionId) };
  }

  async revokeSession(actor: { id: string; email: string; sessionId?: string }, sid: string, confirmCurrent: boolean, meta: SessionMeta = {}) {
    const result = await this.sessions.revokeOne(actor.id, sid, actor.sessionId, confirmCurrent);
    await this.recordSecurityEvent(actor.email, actor.id, 'SESSION_REVOKED', meta);
    return { success: true, ...result };
  }

  async revokeOtherSessions(actor: { id: string; email: string; sessionId?: string }, meta: SessionMeta = {}) {
    const count = await this.sessions.revokeAllExcept(actor.id, actor.sessionId);
    if (count > 0) await this.recordSecurityEvent(actor.email, actor.id, 'OTHER_SESSIONS_REVOKED', meta);
    return { success: true, revoked: count };
  }

  /** The account's own security events, newest first. Scoped to the caller; paginated. */
  async securityActivity(actor: { id: string; email: string }, limit = 20, offset = 0) {
    const take = Math.min(Math.max(Number.isFinite(limit) ? Math.floor(limit) : 20, 1), 50);
    const skip = Math.max(Number.isFinite(offset) ? Math.floor(offset) : 0, 0);
    const where = { actor: actor.email, action: { in: [...SECURITY_EVENT_ACTIONS] } };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      events: rows.map((r) => {
        let meta: { device?: string; ip?: string } = {};
        try {
          meta = r.metadata ? JSON.parse(r.metadata) : {};
        } catch {
          /* leave empty */
        }
        return {
          id: r.id,
          type: r.action,
          at: r.createdAt.toISOString(), // UTC; the client shows it in the viewer's time zone
          device: meta.device ?? null,
          ip: meta.ip ?? null,
        };
      }),
      total,
      limit: take,
      offset: skip,
    };
  }

  /**
   * Get current account status, workspace membership and deactivation eligibility
   */
  async getAccountStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const deactivationRecord = await this.redisService.getCache(`spendguard:account_deactivated:${userId}`);
    const isDeactivated = this.isDeactivated(user);
    let parsedDeactivation: any = null;
    if (deactivationRecord) {
      try {
        parsedDeactivation = JSON.parse(deactivationRecord);
      } catch {}
    }

    // Retrieve organization member counts to verify ownership constraints
    const orgMembers = await this.prisma.user.findMany({
      where: { orgId: user.orgId, deactivatedAt: null },
      select: { id: true, role: true },
    });

    const otherMembers = orgMembers.filter((m) => m.id !== user.id);
    const otherOwners = otherMembers.filter((m) => m.role === 'OWNER');
    const isSoleOwnerOfMultiUserOrg = user.role === 'OWNER' && otherMembers.length > 0 && otherOwners.length === 0;

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
      organization: {
        id: user.organization?.id,
        name: user.organization?.name,
        slug: user.organization?.slug,
        memberCount: orgMembers.length,
      },
      accountStatus: isDeactivated ? 'DEACTIVATED' : 'ACTIVE',
      deactivationDetails: parsedDeactivation,
      ownershipConstraint: {
        canDeactivate: !isSoleOwnerOfMultiUserOrg,
        isSoleOwner: user.role === 'OWNER',
        reason: isSoleOwnerOfMultiUserOrg
          ? 'You are the only OWNER of a multi-member workspace. You must transfer ownership to another team member before deactivating your account.'
          : null,
      },
    };
  }

  /**
   * Secure account deactivation with password verification, ownership safety rules, and session invalidation
   */
  async deactivateAccount(userId: string, dto: { password: string; reason?: string; confirmPhrase: string }) {
    if (dto.confirmPhrase !== 'DEACTIVATE') {
      throw new BadRequestException('Please confirm deactivation by typing DEACTIVATE.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 1. Password identity challenge
    const isValid = await this.verifyPassword(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Incorrect password. Identity confirmation failed.');
    }

    // 2. Organization ownership constraints check
    if (user.role === 'OWNER') {
      const allMembers = await this.prisma.user.findMany({
        where: { orgId: user.orgId, deactivatedAt: null },
        select: { id: true, role: true },
      });
      const otherMembers = allMembers.filter((m) => m.id !== user.id);
      const otherOwners = otherMembers.filter((m) => m.role === 'OWNER');

      // If there are other members in the organization, require an active OWNER to remain
      if (otherMembers.length > 0 && otherOwners.length === 0) {
        throw new BadRequestException(
          'As the sole OWNER of this workspace, you must transfer ownership to another team member before deactivating your account to prevent leaving the workspace unmanaged.'
        );
      }
    }

    // 3. Durable deactivation flag (enforced by login, refresh and every JWT validation)
    await this.prisma.user.update({
      where: { id: user.id },
      data: { deactivatedAt: new Date() },
    });

    const deactivationRecord = {
      userId: user.id,
      orgId: user.orgId,
      reason: dto.reason || 'User requested deactivation',
      deactivatedAt: new Date().toISOString(),
      recoveryAllowedUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    };

    // Descriptive details only — enforcement does not depend on Redis
    await this.redisService.setCache(
      `spendguard:account_deactivated:${user.id}`,
      JSON.stringify(deactivationRecord),
      30 * 24 * 3600,
    );

    // 4. Invalidate sessions in Redis
    await this.redisService.delCache(`spendguard:session:${user.id}`);

    // 5. Record immutable security audit log event
    try {
      await this.prisma.auditLog.create({
        data: {
          actor: user.email,
          action: 'USER_ACCOUNT_DEACTIVATED',
          metadata: JSON.stringify({
            userId: user.id,
            orgId: user.orgId,
            reason: dto.reason || 'User self-deactivation',
            timestamp: new Date().toISOString(),
          }),
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to record audit log for deactivation: ${err.message}`);
    }

    this.logger.warn(`User account deactivated: ${user.id} in org ${user.orgId}`);

    return {
      success: true,
      message: 'Your account has been deactivated and all active sessions have been invalidated. Organization data and other members remain unaffected.',
      recoveryPeriodDays: 30,
    };
  }
}
