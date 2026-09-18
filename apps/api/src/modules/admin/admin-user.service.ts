import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminUserListItem,
  ListUsersPaginationMeta,
} from './dto/admin-user-response.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';

@Injectable()
export class AdminUserService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 9.3 List Platform Users
   * GET /api/v1/admin/users
   * - Paginated list of users for administrative moderation.
   * - Supports filtering by role (STUDENT, RECRUITER) and searching by email (ILIKE / case-insensitive).
   * - Deterministic ordering by created_at DESC, id ASC.
   * - Projections include safe profile summaries and exclude password_hash and secrets.
   */
  async listUsers(query: ListUsersQueryDto): Promise<{
    data: AdminUserListItem[];
    meta: ListUsersPaginationMeta;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const take = limit;

    const where: Prisma.UserWhereInput = {};

    if (query.role) {
      where.role = query.role as UserRole;
    }

    if (query.search) {
      const trimmedSearch = query.search.trim();
      if (trimmedSearch.length > 0) {
        where.email = {
          contains: trimmedSearch,
          mode: 'insensitive',
        };
      }
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
        skip,
        take,
        select: {
          id: true,
          email: true,
          role: true,
          is_banned: true,
          created_at: true,
          student: {
            select: {
              first_name: true,
              last_name: true,
            },
          },
          recruiter: {
            select: {
              first_name: true,
              last_name: true,
              company: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const data: AdminUserListItem[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      is_banned: u.is_banned,
      created_at: u.created_at,
      student: u.student
        ? {
            first_name: u.student.first_name,
            last_name: u.student.last_name,
          }
        : null,
      recruiter: u.recruiter
        ? {
            first_name: u.recruiter.first_name,
            last_name: u.recruiter.last_name,
            company: u.recruiter.company
              ? { name: u.recruiter.company.name }
              : null,
          }
        : null,
    }));

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * 9.4 Delete / Ban User
   * DELETE /api/v1/admin/users/:id
   * - Permanently deletes a user account.
   * - Prohibits self-deletion by an authenticated administrator.
   * - Coordinately removes all dependent relational data in topological referential order
   *   inside an atomic Prisma transaction to maintain database integrity without DB-level ON DELETE CASCADE.
   */
  async deleteUser(
    id: string,
    adminUserId: string
  ): Promise<{ message: string }> {
    // Prevent self-deletion
    if (id === adminUserId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Admins cannot delete their own account',
      });
    }

    // Verify user exists and query linked profiles
    const targetUser = await this.prisma.user.findUnique({
      where: { id },
      include: {
        student: {
          select: { id: true },
        },
        recruiter: {
          select: { id: true },
        },
      },
    });

    if (!targetUser) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User does not exist',
      });
    }

    // Transactional cascading delete in strict foreign key topological order
    await this.prisma.$transaction(async (tx) => {
      // 1. Cascading deletes for STUDENT account
      if (targetUser.student) {
        const studentId = targetUser.student.id;

        // a. Delete all applications submitted by the student
        await tx.application.deleteMany({
          where: { student_id: studentId },
        });

        // b. Delete all interview prep logs associated with the student
        await tx.interviewPrepLog.deleteMany({
          where: { student_id: studentId },
        });

        // c. Query all resumes owned by the student
        const resumes = await tx.resume.findMany({
          where: { student_id: studentId },
          select: { id: true },
        });
        const resumeIds = resumes.map((r) => r.id);

        if (resumeIds.length > 0) {
          // d. Delete AI analyses associated with student resumes
          await tx.aiAnalysis.deleteMany({
            where: { resume_id: { in: resumeIds } },
          });

          // e. Defensively delete any application referencing these resumes
          await tx.application.deleteMany({
            where: { resume_id: { in: resumeIds } },
          });

          // f. Delete resumes
          await tx.resume.deleteMany({
            where: { id: { in: resumeIds } },
          });
        }

        // g. Delete student profile
        await tx.student.delete({
          where: { id: studentId },
        });
      }

      // 2. Cascading deletes for RECRUITER account
      if (targetUser.recruiter) {
        const recruiterId = targetUser.recruiter.id;

        // a. Query all jobs created by this recruiter
        const jobs = await tx.job.findMany({
          where: { recruiter_id: recruiterId },
          select: { id: true },
        });
        const jobIds = jobs.map((j) => j.id);

        if (jobIds.length > 0) {
          // b. Delete all applications submitted to recruiter's jobs
          await tx.application.deleteMany({
            where: { job_id: { in: jobIds } },
          });

          // c. Delete all interview prep logs referencing recruiter's jobs
          await tx.interviewPrepLog.deleteMany({
            where: { job_id: { in: jobIds } },
          });

          // d. Delete jobs
          await tx.job.deleteMany({
            where: { id: { in: jobIds } },
          });
        }

        // d. Delete recruiter profile (company is preserved)
        await tx.recruiter.delete({
          where: { id: recruiterId },
        });
      }

      // 3. Delete target user record
      await tx.user.delete({
        where: { id },
      });
    });

    return {
      message: 'User and associated data deleted.',
    };
  }

  /**
   * 9.5 Soft Ban / Unban User
   * PATCH /api/v1/admin/users/:id/ban
   * - Toggles soft-ban status (is_banned: true/false).
   * - Prohibits self-banning by the authenticated administrator.
   * - Prohibits banning admin accounts to protect administrative controls.
   */
  async updateUserBan(
    id: string,
    isBanned: boolean,
    adminUserId: string
  ): Promise<{
    id: string;
    email: string;
    is_banned: boolean;
    message: string;
  }> {
    if (id === adminUserId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Admins cannot ban their own account',
      });
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        is_banned: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User does not exist',
      });
    }

    if (targetUser.role === UserRole.ADMIN) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Admin accounts cannot be banned',
      });
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { is_banned: isBanned },
      select: {
        id: true,
        email: true,
        is_banned: true,
      },
    });

    return {
      id: updated.id,
      email: updated.email,
      is_banned: updated.is_banned,
      message: isBanned ? 'User has been banned.' : 'User has been unbanned.',
    };
  }
}
