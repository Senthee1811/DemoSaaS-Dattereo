import { Controller, Get, Post, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService, CreateProjectDto, UpdateProjectDto } from './organizations.service';
import { CurrentUser, AuthenticatedUser } from '@/modules/auth/decorators/current-user.decorator';
import { Roles } from '@/modules/auth/decorators/roles.decorator';

@ApiTags('Organizations & Projects')
@ApiBearerAuth()
@Controller('api/v1/projects')
export class OrganizationsController {
  constructor(private readonly orgService: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: "List the caller's organization projects with spend utilization" })
  async getProjects(@CurrentUser() user: AuthenticatedUser) {
    return this.orgService.listProjects(user.orgId);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Create new project with budget bounds' })
  async createProject(@Body() body: CreateProjectDto, @CurrentUser() user: AuthenticatedUser) {
    return this.orgService.createProject(body, user.orgId);
  }

  @Patch()
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Update project budget or toggle emergency hard block' })
  async updateProject(@Body() body: UpdateProjectDto, @CurrentUser() user: AuthenticatedUser) {
    return this.orgService.updateProject(body, user.orgId);
  }
}
