import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
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
}
