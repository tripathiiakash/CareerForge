import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '../core/config/config.service';

/**
 * Target maximum concurrent database connections allocated to Prisma (budget: 5).
 * Combined with PgBoss (3 query + 1 LISTEN = 4), total connections = 9,
 * safely respecting Supabase Session Pooler's hard limit of 15 connections.
 */
export const PRISMA_DEFAULT_CONNECTION_LIMIT = 5;

/**
 * Normalizes and hardens a database URL to strictly enforce connection_limit.
 * - Missing limit: set to targetLimit (default: 5).
 * - Valid limit above targetLimit: clamped to targetLimit (5).
 * - Valid limit from 1 to targetLimit: preserved.
 * - Invalid limits (zero, negative, decimal, non-numeric, malformed): fails explicitly.
 * - Invalid/malformed database URL: fails explicitly.
 * - Undefined/null rawUrl: returns undefined (PrismaClient defaults).
 */
export function resolvePrismaDatabaseUrl(
  rawUrl?: string | null,
  targetLimit: number = PRISMA_DEFAULT_CONNECTION_LIMIT
): string | undefined {
  if (rawUrl === undefined || rawUrl === null) {
    return undefined;
  }
  if (typeof rawUrl !== 'string') {
    throw new Error('Invalid DATABASE_URL: expected a string.');
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Invalid DATABASE_URL: URL cannot be empty.');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Invalid DATABASE_URL: failed to parse database URL.');
  }

  const allLimits = url.searchParams.getAll('connection_limit');
  if (allLimits.length > 1) {
    throw new Error(
      `Invalid DATABASE_URL connection_limit: duplicate connection_limit parameters specified.`
    );
  }

  const rawLimit = url.searchParams.get('connection_limit');

  if (rawLimit === null) {
    url.searchParams.set('connection_limit', targetLimit.toString());
    return url.toString();
  }

  // Strictly positive integer: digits only, non-zero, no sign, no decimal, no leading zeros
  if (!/^[1-9]\d*$/.test(rawLimit)) {
    throw new Error(
      `Invalid DATABASE_URL connection_limit: "${rawLimit}". Expected a strictly positive integer between 1 and ${targetLimit}.`
    );
  }

  const parsedLimit = parseInt(rawLimit, 10);
  if (!Number.isSafeInteger(parsedLimit)) {
    throw new Error(
      `Invalid DATABASE_URL connection_limit: "${rawLimit}". Value exceeds safe integer limit.`
    );
  }

  if (parsedLimit > targetLimit) {
    url.searchParams.set('connection_limit', targetLimit.toString());
    return url.toString();
  }

  return trimmed;
}

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
  constructor(@Optional() configService?: ConfigService) {
    const rawUrl = configService?.databaseUrl || process.env.DATABASE_URL;
    const resolvedUrl = resolvePrismaDatabaseUrl(
      rawUrl,
      PRISMA_DEFAULT_CONNECTION_LIMIT
    );

    if (resolvedUrl) {
      super({
        datasources: {
          db: {
            url: resolvedUrl,
          },
        },
      });
    } else {
      super();
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
