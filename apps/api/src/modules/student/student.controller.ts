import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { StudentProfileResponseDto } from './dto/student-profile-response.dto';
import { StudentService } from './student.service';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  /**
   * 2.1 Get Current Student Profile
   * GET /api/v1/students/me
   */
  @Get('me')
  async getProfile(
    @CurrentUser('userId') userId: string
  ): Promise<StudentProfileResponseDto> {
    const data = await this.studentService.getProfileByUserId(userId);
    return {
      success: true,
      data,
    };
  }
}
