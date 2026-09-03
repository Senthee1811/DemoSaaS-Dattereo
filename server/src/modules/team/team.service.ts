import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listMembers(orgId?: string) {
    const org = await this.prisma.organization.findFirst({
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

  async inviteMember(dto: { name: string; email: string; role: 'ADMIN' | 'MEMBER' }) {
    let org = await this.prisma.organization.findFirst();
    if (!org) {
      org = await this.prisma.organization.create({
        data: { name: 'Apex Innovations Inc.', slug: 'apex-innovations' },
      });
    }

    const user = await this.prisma.user.create({
      data: {
        orgId: org.id,
        name: dto.name,
        email: dto.email,
        passwordHash: '$argon2id$mock-hash-for-demo',
        role: dto.role || 'MEMBER',
      },
    });

    return { user };
  }
}
