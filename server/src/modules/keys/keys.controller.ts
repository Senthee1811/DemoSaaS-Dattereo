import { Controller, Get, Post, Delete, Body, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { KeysService } from './keys.service';
import { CreateKeyDto, TestProviderKeyDto } from './keys.dto';
import { isUUID } from 'class-validator';
import { CurrentUser, AuthenticatedUser } from '@/modules/auth/decorators/current-user.decorator';
import { Roles } from '@/modules/auth/decorators/roles.decorator';

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
  async testConnection(@Body() body: TestProviderKeyDto) {
    return this.keysService.testProviderConnection(body.provider, body.plainKey || body.apiKey || '');
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Store provider key (encrypted) or generate gateway token' })
  async handleCreateKey(@Body() body: CreateKeyDto, @CurrentUser() user: AuthenticatedUser) {
    if (body.type === 'GATEWAY') {
      if (body.expiresAt && new Date(body.expiresAt).getTime() <= Date.now()) {
        throw new BadRequestException('expiresAt must be in the future');
      }
      return this.keysService.generateGatewayKey(body, user.orgId);
    }
    if (body?.type && body.type !== 'PROVIDER') {
      throw new BadRequestException(`Unsupported key type '${body.type}'. Use PROVIDER or GATEWAY.`);
    }
    // A provider key is required for type PROVIDER: blank or whitespace-only is a 400, never stored
    const plainKey = (body.plainKey || body.rawKey || '').trim();
    if (!plainKey) {
      throw new BadRequestException('plainKey is required: enter the provider API key (or skip this step and add it later).');
    }
    if (!body.provider) {
      throw new BadRequestException('provider is required for a PROVIDER key (OPENAI, ANTHROPIC or GEMINI).');
    }
    return this.keysService.storeProviderKey(
      { projectId: body.projectId, provider: body.provider, keyName: body.keyName, plainKey },
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
    if (!id || !isUUID(id)) throw new BadRequestException('id must be a key UUID');
    if (type !== undefined && type !== 'PROVIDER' && type !== 'GATEWAY') {
      throw new BadRequestException('type must be PROVIDER or GATEWAY');
    }
    return this.keysService.revokeKey(id, type || 'PROVIDER', user.orgId);
  }
}
