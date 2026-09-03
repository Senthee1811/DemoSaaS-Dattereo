import { Controller, Get, Post, Patch, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OrganizationsService, CreateProjectDto, UpdateProjectDto } from './organizations.service';

@ApiTags('Organizations & Projects')
@Controller('api/v1/projects')
export class OrganizationsController {
  constructor(private readonly orgService: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'List all projects with spend utilization' })
  async getProjects(@Query('orgId') orgId?: string) {
    return this.orgService.listProjects(orgId);
  }

  @Post()
  @ApiOperation({ summary: 'Create new project with budget bounds' })
  async createProject(@Body() body: CreateProjectDto) {
    return this.orgService.createProject(body);
  }

  @Patch()
  @ApiOperation({ summary: 'Update project budget or toggle emergency hard block' })
  async updateProject(@Body() body: UpdateProjectDto) {
    return this.orgService.updateProject(body);
  }
}
