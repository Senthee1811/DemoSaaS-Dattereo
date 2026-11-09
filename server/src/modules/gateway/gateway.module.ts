import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { OpenAIAdapter } from './adapters/openai.adapter';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { RateLimitMiddleware } from '@/common/middleware/rate-limit.middleware';

@Module({
  controllers: [GatewayController],
  providers: [
    GatewayService,
    OpenAIAdapter,
    AnthropicAdapter,
    GeminiAdapter,
    RateLimitMiddleware,
  ],
  exports: [GatewayService],
})
export class GatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RateLimitMiddleware)
      .forRoutes('v1/chat/completions');
  }
}
