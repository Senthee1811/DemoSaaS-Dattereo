import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

async function bootstrap() {
  const logger = new Logger('SpendGuardBootstrap');
  // Browser traffic goes through the Next.js BFF, so only explicitly listed
  // origins may call the API directly. Auth uses bearer tokens, not cookies.
  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    cors: {
      origin: corsOrigins,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: false,
    },
  });

  // Only trust X-Forwarded-For when explicitly deployed behind a proxy.
  // e.g. TRUST_PROXY=1 (one hop) or TRUST_PROXY=loopback
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // Unknown fields on a validated body are an error, not silently dropped
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  // Global request-ID tracing middleware
  app.use(new RequestIdMiddleware().use);

  // Setup Swagger / OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SpendGuard AI Spend Governance Platform API')
    .setDescription('Production Gateway, Budget Guardrails, Key Vault, and Audit Ledger API')
    .setVersion('2.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`SpendGuard Backend running on http://localhost:${port}`);
  logger.log(`OpenAPI Swagger documentation available at http://localhost:${port}/api/docs`);
}

bootstrap();
