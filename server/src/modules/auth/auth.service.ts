import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import * as crypto from 'crypto';

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
  ) {}

  /**
   * Hash password using PBKDF2 (production-grade, no native dependency issues like argon2 on Windows)
   */
  private async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return `$pbkdf2$${salt}$${hash}`;
  }

  /**
   * Verify password against stored hash
   */
  private async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    if (storedHash.startsWith('$pbkdf2$')) {
      const parts = storedHash.split('$');
      const salt = parts[2];
      const hash = parts[3];
      const derived = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
      return derived === hash;
    }
    // Fallback for seed data with different hash format
    if (storedHash.startsWith('$seed$')) {
      const seedHash = crypto.createHash('sha256').update(password).digest('hex');
      return storedHash === `$seed$${seedHash}`;
    }
    return false;
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
   * Register a new user and organization
   */
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await this.hashPassword(dto.password);

    // Find or create organization
    let org = await this.prisma.organization.findFirst({
      where: dto.orgSlug ? { slug: dto.orgSlug } : undefined,
    });

    if (!org) {
      const orgName = dto.orgName || `${dto.name}'s Organization`;
      const orgSlug = dto.orgSlug || orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      org = await this.prisma.organization.create({
        data: { name: orgName, slug: orgSlug },
      });
    }

    const user = await this.prisma.user.create({
      data: {
        orgId: org.id,
        email: dto.email,
        name: dto.name,
        passwordHash,
        role: 'OWNER',
      },
    });

    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      orgId: org.id,
      role: user.role,
    };

    const tokens = this.generateTokens(payload);

    this.logger.log(`User registered: ${user.email} (${user.role}) in org ${org.name}`);

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
      where: { email: dto.email },
      include: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if account has been deactivated
    const isDeactivated = await this.redisService.getCache(`spendguard:account_deactivated:${user.id}`);
    if (isDeactivated) {
      throw new UnauthorizedException('This account has been deactivated. Please contact your organization administrator or support to request reactivation.');
    }

    const isValid = await this.verifyPassword(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      orgId: user.orgId,
      role: user.role,
    };

    const tokens = this.generateTokens(payload);

    this.logger.log(`User logged in: ${user.email}`);

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
    try {
      const payload = this.jwtService.verify<TokenPayload>(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Check if account has been deactivated
      const isDeactivated = await this.redisService.getCache(`spendguard:account_deactivated:${payload.sub}`);
      if (isDeactivated) {
        throw new UnauthorizedException('Account has been deactivated. Refresh token revoked.');
      }

      const newPayload: TokenPayload = {
        sub: user.id,
        email: user.email,
        orgId: user.orgId,
        role: user.role,
      };

      return this.generateTokens(newPayload);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Validate JWT payload (used by JwtStrategy)
   */
  async validateUser(payload: TokenPayload) {
    // Check if account has been deactivated
    const isDeactivated = await this.redisService.getCache(`spendguard:account_deactivated:${payload.sub}`);
    if (isDeactivated) {
      throw new UnauthorizedException('Account has been deactivated. Access revoked.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
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
   * Request password recovery token.
   * To prevent email enumeration, this returns a generic success message regardless of existence.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const payload = JSON.stringify({ userId: user.id, email: user.email });
      // Store in Redis with 1-hour expiration
      await this.redisService.setCache(`spendguard:pwd_reset:${resetToken}`, payload, 3600);
      this.logger.log(`Password reset token issued for user ${user.id}. SMTP delivery pending service configuration.`);
      
      return {
        success: true,
        message: 'If this email is associated with an account, instructions have been sent.',
        deliveryStatus: 'simulated_pending_smtp_integration',
        resetToken: process.env.NODE_ENV !== 'production' ? resetToken : undefined,
      };
    }

    return {
      success: true,
      message: 'If this email is associated with an account, instructions have been sent.',
      deliveryStatus: 'simulated_pending_smtp_integration',
    };
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

    // Invalidate the token immediately (one-time usage)
    await this.redisService.delCache(`spendguard:pwd_reset:${dto.token}`);
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
    const isDeactivated = Boolean(deactivationRecord);
    let parsedDeactivation: any = null;
    if (deactivationRecord) {
      try {
        parsedDeactivation = JSON.parse(deactivationRecord);
      } catch {}
    }

    // Retrieve organization member counts to verify ownership constraints
    const orgMembers = await this.prisma.user.findMany({
      where: { orgId: user.orgId },
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
        where: { orgId: user.orgId },
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

    // 3. Mark account as deactivated in Redis with 30-day recovery grace period
    const deactivationRecord = {
      userId: user.id,
      email: user.email,
      orgId: user.orgId,
      reason: dto.reason || 'User requested deactivation',
      deactivatedAt: new Date().toISOString(),
      recoveryAllowedUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    };

    await this.redisService.setCache(
      `spendguard:account_deactivated:${user.id}`,
      JSON.stringify(deactivationRecord),
      30 * 24 * 3600 // 30-day retention
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

    this.logger.warn(`User account deactivated: ${user.email} (${user.id}) in org ${user.orgId}`);

    return {
      success: true,
      message: 'Your account has been deactivated and all active sessions have been invalidated. Organization data and other members remain unaffected.',
      recoveryPeriodDays: 30,
    };
  }
}
