import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentService } from '../student/student.service';
import { ResumeListItemDto } from './dto/resume-response.dto';

@Injectable()
export class ResumeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentService: StudentService
  ) {}

  /**
   * Lists all resumes uploaded by the authenticated student.
   * Adheres to docs/API.md §6.2.
   */
  async getStudentResumes(userId: string): Promise<ResumeListItemDto[]> {
    // 1. Resolve student profile from authenticated user ID to enforce ownership
    const student = await this.studentService.getProfileByUserId(userId);

    // 2. Query resumes strictly scoped to the authenticated student
    const resumes = await this.prisma.resume.findMany({
      where: { student_id: student.id },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        file_url: true,
        is_primary: true,
        created_at: true,
        ai_analysis: {
          select: {
            id: true,
          },
        },
      },
    });

    // 3. Map to DTO, checking existence of ai_analysis record for has_analysis flag
    return resumes.map((resume) => ({
      id: resume.id,
      file_url: resume.file_url,
      is_primary: resume.is_primary,
      has_analysis: resume.ai_analysis !== null,
      created_at: resume.created_at.toISOString(),
    }));
  }
}
