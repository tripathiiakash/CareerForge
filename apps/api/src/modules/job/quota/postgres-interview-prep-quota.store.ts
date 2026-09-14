import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  IInterviewPrepQuotaStore,
  QuotaReservation,
} from './interview-prep-quota.interface';

const MAX_DAILY_CALLS = 3;

@Injectable()
export class PostgresInterviewPrepQuotaStore implements IInterviewPrepQuotaStore {
  private readonly logger = new Logger(PostgresInterviewPrepQuotaStore.name);

  constructor(private readonly prisma: PrismaService) {}

  private getUtcDateRange(dateOverride?: string): { start: Date; end: Date } {
    const dateStr = dateOverride || new Date().toISOString().slice(0, 10);
    const start = new Date(`${dateStr}T00:00:00.000Z`);
    const end = new Date(`${dateStr}T23:59:59.999Z`);
    return { start, end };
  }

  async reserveSlot(
    studentId: string,
    jobId: string,
    dateOverride?: string
  ): Promise<QuotaReservation | null> {
    const dateStr = dateOverride || new Date().toISOString().slice(0, 10);
    const { start, end } = this.getUtcDateRange(dateStr);

    return this.prisma.$transaction(async (tx) => {
      // 1. Concurrency protection: Acquire PostgreSQL transaction advisory lock
      // scoped specifically to this student and UTC date.
      // This serializes parallel requests for this student across all Node processes.
      const lockKey = `interview_prep:${studentId}:${dateStr}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      // 2. Count existing reservations for this student on this UTC date
      const count = await tx.interviewPrepLog.count({
        where: {
          student_id: studentId,
          created_at: {
            gte: start,
            lte: end,
          },
        },
      });

      if (count >= MAX_DAILY_CALLS) {
        return null;
      }

      // 3. Atomically create the reservation record
      const log = await tx.interviewPrepLog.create({
        data: {
          student_id: studentId,
          job_id: jobId,
          created_at: dateOverride
            ? new Date(`${dateOverride}T12:00:00.000Z`)
            : undefined,
        },
      });

      return { reservationId: log.id };
    });
  }

  async refundSlot(reservationId: string): Promise<void> {
    try {
      await this.prisma.interviewPrepLog.delete({
        where: { id: reservationId },
      });
      this.logger.log(`Refunded interview prep reservation ${reservationId}`);
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to refund reservation ${reservationId}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  async getUsageToday(
    studentId: string,
    dateOverride?: string
  ): Promise<number> {
    const { start, end } = this.getUtcDateRange(dateOverride);
    return this.prisma.interviewPrepLog.count({
      where: {
        student_id: studentId,
        created_at: {
          gte: start,
          lte: end,
        },
      },
    });
  }

  async resetUsage(studentId: string, dateOverride?: string): Promise<void> {
    const { start, end } = this.getUtcDateRange(dateOverride);
    await this.prisma.interviewPrepLog.deleteMany({
      where: {
        student_id: studentId,
        created_at: {
          gte: start,
          lte: end,
        },
      },
    });
  }
}
