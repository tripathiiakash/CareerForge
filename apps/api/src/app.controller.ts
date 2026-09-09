import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

/**
 * Root controller providing a basic health-check endpoint.
 * Exercises PrismaService dependency injection and validates PostgreSQL connectivity.
 * All domain endpoints will be implemented in their respective feature modules.
 */
@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async healthCheck(): Promise<{
    status: string;
    timestamp: string;
    database: string;
  }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    };
  }
}
