import {
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RateLimitResult } from './rate-limit.types';

interface RateLimitRow {
  hits: number;
  reset_at: Date;
}

/**
 * Persistent PostgreSQL-backed rate limit store (SEC-02).
 *
 * Employs a single atomic parameterized SQL statement:
 *   INSERT ... ON CONFLICT ("key") DO UPDATE ... RETURNING "hits", "reset_at"
 *
 * This guarantees:
 * 1. Concurrency safety: Concurrent requests targeting the same key are serialized
 *    at the database row lock level without lost updates or race conditions.
 * 2. Multi-instance shared state: Any number of API instances share the exact same
 *    counters and windows across process restarts and horizontal scale-out.
 * 3. Minimal DB workload: Exactly 1 indexed query executed per rate-limited request.
 * 4. Bounded storage: Expired buckets are pruned periodically via an indexed reset_at scan.
 * 5. Security failure policy: If PostgreSQL throws an error during increment evaluation,
 *    the error is logged and rethrown (fail-closed) so protected routes are not left open
 *    to unmonitored abuse during database degradation.
 */
@Injectable()
export class RateLimitStore implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitStore.name);
  private readonly cleanupInterval?: NodeJS.Timeout;

  constructor(
    @Optional()
    private readonly prisma?: PrismaService
  ) {
    // Run lightweight background cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired().catch((err) => {
        this.logger.warn(`Background rate-limit cleanup failed: ${err.message}`);
      });
    }, 60000);

    // Prevent interval from blocking Node.js process exit during tests/shutdown
    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Atomically records a hit for the specified key within the given window.
   * Serialized at the PostgreSQL row level; safe under high concurrency.
   */
  async increment(
    key: string,
    limit: number,
    ttlSeconds: number
  ): Promise<RateLimitResult> {
    if (!this.prisma) {
      throw new Error(
        'RateLimitStore: PrismaService is required for persistent rate limiting.'
      );
    }

    const now = new Date();
    const newResetAt = new Date(now.getTime() + ttlSeconds * 1000);

    try {
      const rows = await this.prisma.$queryRaw<RateLimitRow[]>`
        INSERT INTO "rate_limits" ("key", "hits", "reset_at", "updated_at")
        VALUES (${key}, 1, ${newResetAt}, ${now})
        ON CONFLICT ("key") DO UPDATE
        SET
          hits = CASE
            WHEN "rate_limits"."reset_at" <= ${now} THEN 1
            ELSE "rate_limits"."hits" + 1
          END,
          reset_at = CASE
            WHEN "rate_limits"."reset_at" <= ${now} THEN ${newResetAt}
            ELSE "rate_limits"."reset_at"
          END,
          updated_at = ${now}
        RETURNING "hits", "reset_at";
      `;

      const record = rows[0];
      const totalHits = Number(record.hits);
      const resetAtDate = new Date(record.reset_at);
      const resetAtMs = resetAtDate.getTime();
      const nowMs = now.getTime();

      const remaining = Math.max(0, limit - totalHits);
      const resetAt = Math.ceil(resetAtMs / 1000);
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((resetAtMs - nowMs) / 1000)
      );
      const isBlocked = totalHits > limit;

      return {
        totalHits,
        remaining,
        resetAt,
        isBlocked,
        retryAfterSeconds,
      };
    } catch (error) {
      this.logger.error(
        `Failed to record rate limit hit for key "${key}": ${(error as Error).message}`,
        (error as Error).stack
      );
      // Fail-closed: rethrow database errors so rate-limited resources are not unprotected
      throw error;
    }
  }

  /**
   * Deletes all expired rate-limit records using the indexed reset_at column.
   * Safe to call opportunistically or on interval; never crashes the application.
   */
  async cleanupExpired(): Promise<number> {
    if (!this.prisma) return 0;

    try {
      const deletedCount = await this.prisma.$executeRaw`
        DELETE FROM "rate_limits"
        WHERE "reset_at" <= NOW()
      `;
      return Number(deletedCount);
    } catch (error) {
      this.logger.warn(
        `RateLimitStore cleanupExpired encountered error: ${(error as Error).message}`
      );
      return 0;
    }
  }

  /**
   * Manually resets a specific key (used for administrative resets or test isolation).
   */
  async reset(key: string): Promise<void> {
    if (!this.prisma) return;
    await this.prisma.rateLimit.deleteMany({
      where: { key },
    });
  }

  /**
   * Manually clears all records (used for test isolation).
   */
  async clear(): Promise<void> {
    if (!this.prisma) return;
    await this.prisma.$executeRaw`TRUNCATE TABLE "rate_limits"`;
  }

  /**
   * Returns current active record count in the database.
   */
  async size(): Promise<number> {
    if (!this.prisma) return 0;
    return this.prisma.rateLimit.count();
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
