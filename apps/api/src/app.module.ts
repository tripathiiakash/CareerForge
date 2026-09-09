import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from './core/config/config.module';
import { PrismaModule } from './prisma/prisma.module';

/**
 * Root application module.
 * ConfigModule and PrismaModule are registered globally here so all future domain
 * feature modules (Auth, Profiles, Jobs, Applications, AI) can inject ConfigService
 * and PrismaService directly.
 */
@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
