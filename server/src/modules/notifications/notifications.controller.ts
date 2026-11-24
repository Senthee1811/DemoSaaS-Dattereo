import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '@/modules/auth/decorators/current-user.decorator';
import { Roles } from '@/modules/auth/decorators/roles.decorator';
import { NotificationsService } from './notifications.service';

// Bodies are plain interfaces on purpose: the global ValidationPipe uses `whitelist: true`, which would strip every
// property of an undecorated DTO class. The service validates explicitly.
interface CreateChannelBody { type?: string; name?: string; eventTypes?: string[]; config?: Record<string, unknown> }
interface UpdateChannelBody { name?: string; enabled?: boolean; eventTypes?: string[] }

const int = (v: string | undefined, d: number, min: number, max: number) => {
  const n = v ? parseInt(v, 10) : d;
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : d;
};

/** Organization-level notification channels, delivery history and the in-app inbox. Everything is scoped to the caller's org. */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get('channels')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'List notification channels (destination details are never returned)' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listChannels(user.orgId);
  }

  @Post('channels')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Create a Slack, signed-webhook or email channel' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateChannelBody) {
    return this.service.createChannel(user.orgId, user.id, body ?? {});
  }

  @Patch('channels/:id')
  @Roles('OWNER', 'ADMIN')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateChannelBody) {
    return this.service.updateChannel(user.orgId, id, body ?? {});
  }

  @Delete('channels/:id')
  @Roles('OWNER', 'ADMIN')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteChannel(user.orgId, id);
  }

  @Post('channels/:id/rotate-secret')
  @Roles('OWNER', 'ADMIN')
  rotate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.rotateSecret(user.orgId, id);
  }

  @Post('channels/:id/test')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Send a clearly labelled test event to one channel' })
  test(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.sendTest(user.orgId, id);
  }

  @Get('deliveries')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Delivery history with status, attempts and the last error' })
  deliveries(@CurrentUser() user: AuthenticatedUser, @Query('channelId') channelId?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.service.deliveries(user.orgId, { channelId, status, limit: int(limit, 50, 1, 200), offset: int(offset, 0, 0, 100000) });
  }

  @Post('deliveries/:id/retry')
  @Roles('OWNER', 'ADMIN')
  retry(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.retryDelivery(user.orgId, id);
  }

  @Get('inbox')
  @ApiOperation({ summary: 'In-app notifications for the organization' })
  inbox(@CurrentUser() user: AuthenticatedUser, @Query('unread') unread?: string) {
    return this.service.inbox(user.orgId, unread === 'true');
  }

  @Post('inbox/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Body() body: { ids?: string[] }) {
    return this.service.markRead(user.orgId, Array.isArray(body?.ids) ? body.ids.slice(0, 200).map(String) : undefined);
  }
}
