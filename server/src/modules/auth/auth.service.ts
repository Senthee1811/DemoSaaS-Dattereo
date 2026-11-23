import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { EmailService } from '@/modules/email/email.service';
import { appUrl } from '@/common/app-url';
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
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly emailService: EmailService,
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
    });

    return { accessToken, refreshToken };
  }

  /**
   * Register a new user. Self-service sign-up ALWAYS creates a new, isolated
   * organization owned by the registrant — joining an existing organization
   * is only possible through a team invite issued by that organization.
   */
  async register(dto: RegisterDto) {
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

    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      orgId: org.id,
      role: user.role,
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
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(dto.email) },
      include: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isValid = await this.verifyPassword(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Only reveal deactivation status once the password has been proven
    if (this.isDeactivated(user)) {
      throw new UnauthorizedException('This account has been deactivated. Please contact your organization administrator or support to request reactivation.');
    }

    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      orgId: user.orgId,
      role: user.role,
    };

    const tokens = this.generateTokens(payload);

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

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || this.isDeactivated(user)) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Re-read role/org from DB so role changes take effect on refresh
    return this.generateTokens({
      sub: user.id,
      email: user.email,
      orgId: user.orgId,
      role: user.role,
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

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: user.orgId,
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
      data: { passwordHash: newHash },
    });

    this.logger.log(`Password successfully updated for user ${parsed.userId}.`);

    return {
      success: true,
      message: 'Your password has been reset successfully. Please log in with your new credentials.',
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
