import { Module } from '@nestjs/common';
import { AppController } from './app.controller';

/**
 * Root application module.
 * Domain feature modules (Auth, Profiles, Jobs, Applications, AI) will be
 * imported here as they are implemented in subsequent phases.
 */
@Module({
  imports: [],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
