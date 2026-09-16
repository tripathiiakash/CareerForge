import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { RateLimitResult } from './rate-limit.types';

interface RateLimitRecord {
  hits: number;
  resetAtMs: number;
}

/**
 * High-performance, in-memory sliding window rate limit store.
 * Automatically cleans up expired records periodically to prevent unbounded memory growth.
 */
@Injectable()
export class RateLimitStore implements OnModuleDestroy {
  private readonly records = new Map<string, RateLimitRecord>();
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Run cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000);

    // Prevent interval from keeping the Node.js event loop alive in background/tests
    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Atomically records a hit for the specified key within the given window.
   */
  increment(key: string, limit: number, ttlSeconds: number): RateLimitResult {
    const now = Date.now();
    let record = this.records.get(key);

    if (!record || now >= record.resetAtMs) {
      record = {
        hits: 1,
        resetAtMs: now + ttlSeconds * 1000,
      };
      this.records.set(key, record);
    } else {
      record.hits += 1;
    }

    const totalHits = record.hits;
    const remaining = Math.max(0, limit - totalHits);
    const resetAt = Math.ceil(record.resetAtMs / 1000);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((record.resetAtMs - now) / 1000)
    );
    const isBlocked = totalHits > limit;

    return {
      totalHits,
      remaining,
      resetAt,
      isBlocked,
      retryAfterSeconds,
    };
  }

  /**
   * Cleans up all expired records from memory.
   */
  cleanupExpired(): void {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (now >= record.resetAtMs) {
        this.records.delete(key);
      }
    }
  }

  /**
   * Manually clears all records (used for test isolation).
   */
  clear(): void {
    this.records.clear();
  }

  /**
   * Manually resets a specific key.
   */
  reset(key: string): void {
    this.records.delete(key);
  }

  /**
   * Returns current active record count in memory.
   */
  size(): number {
    return this.records.size;
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
