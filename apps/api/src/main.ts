import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Express } from 'express';
import { AppModule } from './app.module';
import { ConfigService } from './core/config/config.service';
import { loadEnvironment } from './core/config/env-loader';
import { AllExceptionsFilter } from './core/filters/all-exceptions.filter';

async function bootstrap() {
  // 1. Pre-load .env into process.env before any service initialization
  loadEnvironment();

  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // 2. Retrieve validated configuration
  const config = app.get(ConfigService);

  // 3. Security defaults: disable Express technology fingerprinting
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  if (typeof expressApp?.disable === 'function') {
    expressApp.disable('x-powered-by');
  }

  // 4. CORS configuration
  app.enableCors({
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // 5. Global API prefix – matches the finalized API spec base URL
  app.setGlobalPrefix('api/v1');

  // 6. Standardized Global Exception Handling adhering to docs/API.md
  app.useGlobalFilters(new AllExceptionsFilter(config));

  // 7. Enable graceful shutdown: calls OnModuleDestroy hooks
  // (including PrismaService.$disconnect) on SIGTERM / SIGINT.
  app.enableShutdownHooks();

  await app.listen(config.port);
  logger.log(
    `CareerForge API is running in ${config.nodeEnv} mode on http://localhost:${config.port}/api/v1`
  );
}

bootstrap();
