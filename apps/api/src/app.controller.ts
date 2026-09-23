import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from './prisma/prisma.service';
import { QueueService } from './core/queue/queue.service';

export interface HealthCheckResponse {
  status: 'ok';
  timestamp: string;
}

export interface ReadinessCheckResponse {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    database: 'connected' | 'error';
    queue: 'active' | 'inactive';
  };
}

/**
 * Root Controller for Production Health & Observability Probes
 *
 * Provides:
 * - /health: Liveness probe (lightweight, zero external dependencies).
 * - /ready: Readiness probe (verifies PostgreSQL connectivity and pg-boss queue engine state).
 *
 * Neither endpoint exposes credentials, database connection strings, or internal secrets.
 */
@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService
  ) {}

  /**
   * Liveness Probe
   * Lightweight probe confirming the process is alive and accepting connections.
   */
  @Get(['health', 'api/v1/health'])
  healthCheck(): HealthCheckResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness Probe
   * Verifies required PostgreSQL connectivity and pg-boss queue operational state.
   * Returns HTTP 200 OK when ready to receive live user traffic.
   * Returns HTTP 503 Service Unavailable when any dependency check fails.
   */
  @Get(['ready', 'api/v1/ready'])
  async readinessCheck(@Res() res: Response): Promise<void> {
    const checks: ReadinessCheckResponse['checks'] = {
      database: 'error',
      queue: 'inactive',
    };

    let isDbHealthy = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'connected';
      isDbHealthy = true;
    } catch {
      checks.database = 'error';
    }

    const isQueueHealthy = this.queueService.isReady();
    checks.queue = isQueueHealthy ? 'active' : 'inactive';

    const isReady = isDbHealthy && isQueueHealthy;
    const statusCode = isReady
      ? HttpStatus.OK
      : HttpStatus.SERVICE_UNAVAILABLE;

    res.status(statusCode).json({
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks,
    });
  }
}
