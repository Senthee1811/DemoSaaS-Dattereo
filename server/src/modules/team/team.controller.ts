import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TeamService } from './team.service';

@ApiTags('Team & RBAC')
@Controller('api/v1/team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  @ApiOperation({ summary: 'List organization team members with role hierarchy' })
  async getTeam(@Query('orgId') orgId?: string) {
    return this.teamService.listMembers(orgId);
  }

  @Post()
  @ApiOperation({ summary: 'Invite new member and assign organization role' })
  async inviteUser(@Body() body: { name: string; email: string; role: 'ADMIN' | 'MEMBER' }) {
    return this.teamService.inviteMember(body);
  }
}
