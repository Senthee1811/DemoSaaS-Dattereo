import {
  Injectable,
  Logger,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { AuthenticatedUser } from '@/modules/auth/decorators/current-user.decorator';
import { EmailService } from '@/modules/email/email.service';
import { appUrl } from '@/common/app-url';
import * as crypto from 'crypto';

const INVITE_TTL_SECONDS = 7 * 24 * 3600;

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly emailService: EmailService,
  ) {}

  async listMembers(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        users: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatarUrl: true,
            deactivatedAt: true,
            createdAt: true,
          },
        },
      },
    });

    return {
      organization: org ? { id: org.id, name: org.name, slug: org.slug } : null,
      users: org?.users || [],
    };
  }

  /**
   * Invites a member into the caller's organization. The invitee receives a
   * one-time "set password" token (7 days) that works with /auth/reset-password.
   */
  async inviteMember(
    dto: { name: string; email: string; role: 'ADMIN' | 'MEMBER' },
    actor: AuthenticatedUser,
  ) {
    const email = (dto.email || '').trim().toLowerCase();
    const name = (dto.name || '').trim();
    if (!email || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('A valid name and email are required');
    }

    const role = dto.role === 'ADMIN' ? 'ADMIN' : 'MEMBER';

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException(`User with email ${email} already exists`);
    }

    // Random, unknown password — the invitee must set their own via the invite token
    const tempSalt = crypto.randomBytes(32).toString('hex');
    const tempSecret = crypto.randomBytes(24).toString('hex');
    const hash = crypto.pbkdf2Sync(tempSecret, tempSalt, 100000, 64, 'sha512').toString('hex');
    const passwordHash = `$pbkdf2$${tempSalt}$${hash}`;

    const user = await this.prisma.user.create({
      data: {
        orgId: actor.orgId,
        name,
        email,
        passwordHash,
        role,
      },
      select: {
        id: true,
        orgId: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    if (this.redisService.isConnected) {
      const inviteToken = crypto.randomBytes(32).toString('hex');
      await this.redisService.setCache(
        `spendguard:pwd_reset:${inviteToken}`,
        JSON.stringify({ userId: user.id, email: user.email }),
        INVITE_TTL_SECONDS,
      );
      const org = await this.prisma.organization.findUnique({ where: { id: actor.orgId }, select: { name: true } });
      // The token only ever travels by email; it is never returned to the caller.
      void this.emailService.sendOrgInvite(
        user.email,
        `${appUrl()}/forgot-password?token=${inviteToken}`,
        org?.name || 'your team',
        actor.name || 'A teammate',
      );
    }

    this.logger.log(`Member ${user.id} invited into organization ${actor.orgId} by ${actor.id}`);

    return {
      user,
      // Tells the UI whether an email could actually have gone out (RESEND_API_KEY set).
      invite: { emailConfigured: Boolean(process.env.RESEND_API_KEY) && this.redisService.isConnected, expiresInDays: 7 },
    };
  }

  async updateRole(userId: string, role: 'OWNER' | 'ADMIN' | 'MEMBER', actor: AuthenticatedUser) {
    if (!['OWNER', 'ADMIN', 'MEMBER'].includes(role)) {
      throw new BadRequestException('role must be OWNER, ADMIN or MEMBER');
    }

    const target = await this.prisma.user.findFirst({ where: { id: userId, orgId: actor.orgId } });
    if (!target) throw new NotFoundException('Member not found');

    if (target.id === actor.id && role !== 'OWNER') {
      const owners = await this.prisma.user.count({
        where: { orgId: actor.orgId, role: 'OWNER', deactivatedAt: null },
      });
      if (owners <= 1) {
        throw new ForbiddenException('Promote another member to OWNER before stepping down.');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });

    return { user: updated };
  }
}
