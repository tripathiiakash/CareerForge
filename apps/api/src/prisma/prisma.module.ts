import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule registers PrismaService as a global provider.
 *
 * Marking it @Global() means every feature module in the monolith can inject
 * PrismaService without explicitly importing PrismaModule in each module's
 * imports array. Import PrismaModule once in AppModule.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
