import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ConfigService } from './core/config/config.service';
import { loadEnvironment } from './core/config/env-loader';
import { AllExceptionsFilter } from './core/filters/all-exceptions.filter';
import { JsonLoggerService } from './core/logging/json-logger.service';

async function bootstrap() {
  // 1. Pre-load .env into process.env before any service initialization
  loadEnvironment();

  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.LOG_FORMAT === 'json';
  const customLogger = isProduction
    ? new JsonLoggerService()
    : new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: isProduction ? new JsonLoggerService() : ['log', 'warn', 'error'],
  });

  // 2. Retrieve validated configuration
  const config = app.get(ConfigService);

  // 3. Security defaults: disable technology fingerprinting, configure trusted reverse proxies & enforce body limits
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  if (typeof expressApp?.disable === 'function') {
    expressApp.disable('x-powered-by');
  }
  if (typeof expressApp?.set === 'function') {
    expressApp.set('trust proxy', config.trustProxy);
  }
  expressApp.use(express.json({ limit: '1mb' }));
  expressApp.use(express.urlencoded({ extended: true, limit: '1mb' }));
  expressApp.use(cookieParser());

  // 4. CORS configuration (supports single or comma-separated origins)
  const allowedOrigins = config.corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // 5. Global API prefix – matches the finalized API spec base URL (excludes root health/ready probes)
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'ready'],
  });

  // 6. Standardized Global Exception Handling adhering to docs/API.md
  app.useGlobalFilters(new AllExceptionsFilter(config));

  // 7. Enable graceful shutdown: calls OnModuleDestroy hooks
  // (including PrismaService.$disconnect) on SIGTERM / SIGINT.
  app.enableShutdownHooks();

  await app.listen(config.port);
  customLogger.log(
    `CareerForge API is running in ${config.nodeEnv} mode on http://localhost:${config.port}/api/v1`
  );
}

bootstrap();
