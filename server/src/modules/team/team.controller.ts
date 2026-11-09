import { Controller, Get, Post, Body, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TeamService } from './team.service';
import { Request } from 'express';

@ApiTags('Team & RBAC')
@Controller('api/v1/team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  @ApiOperation({ summary: 'List organization team members with role hierarchy' })
  async getTeam(@Query('orgId') orgId?: string, @Req() req?: Request) {
    const effectiveOrgId = (req as any)?.user?.orgId || orgId;
    return this.teamService.listMembers(effectiveOrgId);
  }

  @Post()
  @ApiOperation({ summary: 'Invite new member and assign organization role' })
  async inviteUser(
    @Body() body: { name: string; email: string; role: 'ADMIN' | 'MEMBER'; orgId?: string },
    @Req() req?: Request,
  ) {
    const effectiveOrgId = (req as any)?.user?.orgId || body.orgId;
    return this.teamService.inviteMember(body, effectiveOrgId);
  }
}
