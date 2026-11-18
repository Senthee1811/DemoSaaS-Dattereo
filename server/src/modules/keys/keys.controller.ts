import { Controller, Get, Post, Delete, Body, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { KeysService } from './keys.service';
import { CurrentUser, AuthenticatedUser } from '@/modules/auth/decorators/current-user.decorator';
import { Roles } from '@/modules/auth/decorators/roles.decorator';

type ProviderName = 'OPENAI' | 'ANTHROPIC' | 'GEMINI';

@ApiTags('Key Vault & API Tokens')
@ApiBearerAuth()
@Controller('api/v1/keys')
export class KeysController {
  constructor(private readonly keysService: KeysService) {}

  @Get()
  @ApiOperation({ summary: 'List provider keys and scoped gateway tokens for the caller organization' })
  async getKeys(@CurrentUser() user: AuthenticatedUser, @Query('projectId') projectId?: string) {
    return this.keysService.listKeys(user.orgId, projectId);
  }

  @Post('provider/test')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Test upstream provider connection before storing key' })
  async testConnection(@Body() body: { provider: ProviderName; plainKey?: string; apiKey?: string }) {
    return this.keysService.testProviderConnection(body.provider, body.plainKey || body.apiKey || '');
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Store provider key (encrypted) or generate gateway token' })
  async handleCreateKey(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    if (body?.type === 'GATEWAY') {
      return this.keysService.generateGatewayKey(body, user.orgId);
    }
    if (body?.type && body.type !== 'PROVIDER') {
      throw new BadRequestException(`Unsupported key type '${body.type}'. Use PROVIDER or GATEWAY.`);
    }
    return this.keysService.storeProviderKey(
      { ...body, plainKey: body?.plainKey || body?.rawKey },
      user.orgId,
    );
  }

  @Delete()
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Revoke provider key or gateway token' })
  async revokeKey(
    @CurrentUser() user: AuthenticatedUser,
    @Query('id') id: string,
    @Query('type') type: 'PROVIDER' | 'GATEWAY',
  ) {
    return this.keysService.revokeKey(id, type || 'PROVIDER', user.orgId);
  }
}
