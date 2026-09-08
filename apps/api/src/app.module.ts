import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';

/**
 * Root application module.
 * PrismaModule is registered globally here so all future domain feature modules
 * (Auth, Profiles, Jobs, Applications, AI) can inject PrismaService directly.
 * Domain feature modules will be imported here as they are implemented.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
