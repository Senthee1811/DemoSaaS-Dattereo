import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Ensures a project belongs to the caller's organization.
 * Returns 404 (not 403) so project IDs from other tenants are not disclosed.
 */
export async function assertProjectInOrg(prisma: PrismaService, projectId: string | undefined, orgId: string) {
  if (!projectId) throw new NotFoundException('Project not found');
  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new NotFoundException('Project not found');
  return project;
}
