import { Controller, Get, Post, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TeamService } from './team.service';
import { InviteMemberDto, UpdateRoleDto } from './team.dto';
import { CurrentUser, AuthenticatedUser } from '@/modules/auth/decorators/current-user.decorator';
import { Roles } from '@/modules/auth/decorators/roles.decorator';

@ApiTags('Team & RBAC')
@ApiBearerAuth()
@Controller('api/v1/team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  @ApiOperation({ summary: 'List organization team members with role hierarchy' })
  async getTeam(@CurrentUser() user: AuthenticatedUser) {
    return this.teamService.listMembers(user.orgId);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Invite new member and assign organization role' })
  async inviteUser(
    @Body() body: InviteMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teamService.inviteMember(body, user);
  }

  @Patch()
  @Roles('OWNER')
  @ApiOperation({ summary: 'Change a member role (OWNER only)' })
  async updateRole(
    @Body() body: UpdateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teamService.updateRole(body.userId, body.role, user);
  }
}
