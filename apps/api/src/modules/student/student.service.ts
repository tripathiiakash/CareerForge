import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentProfileData } from './dto/student-profile-response.dto';

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
}
