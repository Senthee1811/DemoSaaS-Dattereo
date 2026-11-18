import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { OpenAIAdapter } from './adapters/openai.adapter';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { RateLimitMiddleware } from '@/common/middleware/rate-limit.middleware';
import { AuthModule } from '@/modules/auth/auth.module';

@Module({
  imports: [AuthModule],
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
    // Apply to every alias of the completions route so the limit can't be side-stepped
    consumer
      .apply(RateLimitMiddleware)
      .forRoutes(
        { path: 'v1/chat/completions', method: RequestMethod.POST },
        { path: 'api/v1/chat/completions', method: RequestMethod.POST },
      );
  }
}
