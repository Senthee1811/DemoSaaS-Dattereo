import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listMembers(orgId?: string) {
    const org = orgId
      ? await this.prisma.organization.findUnique({
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
                createdAt: true,
              },
            },
          },
        })
      : await this.prisma.organization.findFirst({
          include: {
            users: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                avatarUrl: true,
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

  async inviteMember(
    dto: { name: string; email: string; role: 'ADMIN' | 'MEMBER' },
    orgId?: string,
  ) {
    let targetOrgId = orgId;
    if (!targetOrgId) {
      let org = await this.prisma.organization.findFirst();
      if (!org) {
        org = await this.prisma.organization.create({
          data: { name: 'Apex Innovations Inc.', slug: 'apex-innovations' },
        });
      }
      targetOrgId = org.id;
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException(`User with email ${dto.email} already exists`);
    }

    // Generate cryptographic temporary salted hash for invited member
    const tempSalt = crypto.randomBytes(32).toString('hex');
    const tempSecret = crypto.randomBytes(24).toString('hex');
    const hash = crypto.pbkdf2Sync(tempSecret, tempSalt, 100000, 64, 'sha512').toString('hex');
    const passwordHash = `$pbkdf2$${tempSalt}$${hash}`;

    const user = await this.prisma.user.create({
      data: {
        orgId: targetOrgId,
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: dto.role || 'MEMBER',
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

    this.logger.log(`Invited member ${user.email} into organization ${targetOrgId}`);

    return { user };
  }
}
