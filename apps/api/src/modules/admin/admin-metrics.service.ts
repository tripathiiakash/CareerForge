import { Injectable } from '@nestjs/common';
import { JobStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformMetricsData } from './dto/admin-metrics-response.dto';

@Injectable()
export class AdminMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 9.5 Get Platform Metrics
   * GET /api/v1/admin/metrics
   *
   * Aggregates high-level platform counters across core relational entities:
   * - total_students: Count of users with role STUDENT
   * - total_recruiters: Count of users with role RECRUITER
   * - active_jobs: Count of jobs with status ACTIVE
   * - pending_jobs: Count of jobs with status PENDING
   * - total_applications: Total count of all application records
   */
  async getMetrics(): Promise<PlatformMetricsData> {
    const [
      total_students,
      total_recruiters,
      active_jobs,
      pending_jobs,
      total_applications,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.STUDENT } }),
      this.prisma.user.count({ where: { role: UserRole.RECRUITER } }),
      this.prisma.job.count({ where: { status: JobStatus.ACTIVE } }),
      this.prisma.job.count({ where: { status: JobStatus.PENDING } }),
      this.prisma.application.count(),
    ]);

    return {
      total_students,
      total_recruiters,
      active_jobs,
      pending_jobs,
      total_applications,
    };
  }
}
