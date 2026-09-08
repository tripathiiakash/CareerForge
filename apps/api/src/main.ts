import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global API prefix – matches the finalized API spec base URL
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT ?? 5000;
  await app.listen(port);
  console.log(`CareerForge API is running on http://localhost:${port}/api/v1`);
}

bootstrap();
