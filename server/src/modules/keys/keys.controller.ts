import { Controller, Get, Post, Delete, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { KeysService, StoreProviderKeyDto, GenerateGatewayKeyDto } from './keys.service';

@ApiTags('Key Vault & API Tokens')
@Controller('api/v1/keys')
export class KeysController {
  constructor(private readonly keysService: KeysService) {}

  @Get()
  @ApiOperation({ summary: 'List provider keys and scoped gateway tokens' })
  async getKeys(@Query('projectId') projectId?: string) {
    return this.keysService.listKeys(projectId);
  }

  @Post('provider/test')
  @ApiOperation({ summary: 'Test upstream provider connection before storing key' })
  async testConnection(@Body() body: { provider: 'OPENAI' | 'ANTHROPIC' | 'GEMINI'; plainKey: string }) {
    return this.keysService.testProviderConnection(body.provider, body.plainKey);
  }

  @Post()
  @ApiOperation({ summary: 'Store provider key (encrypted) or generate gateway token' })
  async handleCreateKey(@Body() body: any) {
    if (body.type === 'GATEWAY') {
      return this.keysService.generateGatewayKey(body);
    }
    return this.keysService.storeProviderKey(body);
  }

  @Delete()
  @ApiOperation({ summary: 'Revoke provider key or gateway token' })
  async revokeKey(@Query('id') id: string, @Query('type') type: 'PROVIDER' | 'GATEWAY') {
    return this.keysService.revokeKey(id, type || 'PROVIDER');
  }
}
