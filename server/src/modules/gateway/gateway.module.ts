import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { OpenAIAdapter } from './adapters/openai.adapter';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { GroqAdapter } from './adapters/groq.adapter';
import { RateLimitMiddleware } from '@/common/middleware/rate-limit.middleware';
import { AuthModule } from '@/modules/auth/auth.module';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { RequestLedgerProcessor } from './request-ledger.processor';
import { REQUEST_LEDGER_QUEUE } from './request-ledger.queue';
import { ANOMALY_QUEUE } from '@/modules/anomaly/anomaly.queue';

@Module({
  imports: [
    AuthModule,
    // Producer side of the anomaly queue (the consumer lives in AnomalyModule)
    BullModule.registerQueueAsync({
      name: ANOMALY_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host') || 'localhost',
          port: configService.get<number>('redis.port') || 6379,
          password: configService.get<string>('redis.password') || undefined,
        },
      }),
    }),
    BullModule.registerQueueAsync({
      name: REQUEST_LEDGER_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host') || 'localhost',
          port: configService.get<number>('redis.port') || 6379,
          password: configService.get<string>('redis.password') || undefined,
        },
      }),
    }),
  ],
  controllers: [GatewayController],
  providers: [
    GatewayService,
    OpenAIAdapter,
    AnthropicAdapter,
    GeminiAdapter,
    GroqAdapter,
    RateLimitMiddleware,
    RequestLedgerProcessor,
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
