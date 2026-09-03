import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { OpenAIAdapter } from './adapters/openai.adapter';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';

@Module({
  controllers: [GatewayController],
  providers: [
    GatewayService,
    OpenAIAdapter,
    AnthropicAdapter,
    GeminiAdapter,
  ],
  exports: [GatewayService],
})
export class GatewayModule {}
