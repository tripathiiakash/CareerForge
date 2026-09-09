import { Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service';

/**
 * ConfigModule registers ConfigService as a global provider.
 * Any module across the modular monolith can inject ConfigService directly.
 */
@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
