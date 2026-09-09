import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentProfileData } from './dto/student-profile-response.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';

@Injectable()
export class StudentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves student profile data by associated user ID.
   * Adheres to docs/API.md §2.1.
   */
  async getProfileByUserId(userId: string): Promise<StudentProfileData> {
    const student = await this.prisma.student.findUnique({
      where: { user_id: userId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        university: true,
        graduation_year: true,
        degree: true,
        skills: true,
        github_url: true,
        linkedin_url: true,
      },
    });

    if (!student) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Student profile record does not exist',
      });
    }

    return student;
  }

  /**
   * Partially updates student profile data by associated user ID.
   * Adheres to docs/API.md §2.2.
   */
  async updateProfileByUserId(
    userId: string,
    dto: UpdateStudentProfileDto
  ): Promise<StudentProfileData> {
    const existing = await this.prisma.student.findUnique({
      where: { user_id: userId },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Student profile record does not exist',
      });
    }

    const normalizedSkills =
      dto.skills !== undefined
        ? Array.from(new Set(dto.skills.map((s) => s.toLowerCase())))
        : undefined;

    const updated = await this.prisma.student.update({
      where: { user_id: userId },
      data: {
        ...(dto.first_name !== undefined && { first_name: dto.first_name }),
        ...(dto.last_name !== undefined && { last_name: dto.last_name }),
        ...(dto.university !== undefined && { university: dto.university }),
        ...(dto.graduation_year !== undefined && {
          graduation_year: dto.graduation_year,
        }),
        ...(dto.degree !== undefined && { degree: dto.degree }),
        ...(normalizedSkills !== undefined && { skills: normalizedSkills }),
        ...(dto.github_url !== undefined && { github_url: dto.github_url }),
        ...(dto.linkedin_url !== undefined && {
          linkedin_url: dto.linkedin_url,
        }),
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        university: true,
        graduation_year: true,
        degree: true,
        skills: true,
        github_url: true,
        linkedin_url: true,
      },
    });

    return updated;
  }
}
