import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService wraps PrismaClient and integrates it with the NestJS
 * application lifecycle.
 *
 * - OnModuleInit  → opens the connection pool when the module is bootstrapped.
 * - OnModuleDestroy → closes the connection pool on graceful shutdown.
 *
 * This is the single instance of PrismaClient in the application.
 * Inject PrismaService into feature services; never instantiate PrismaClient directly.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
