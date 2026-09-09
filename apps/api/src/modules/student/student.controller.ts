import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { updateStudentProfileSchema } from '@careerforge/validation';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { StudentProfileResponseDto } from './dto/student-profile-response.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
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

  /**
   * 2.2 Update Student Profile
   * PATCH /api/v1/students/me
   */
  @Patch('me')
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(updateStudentProfileSchema))
    dto: UpdateStudentProfileDto
  ): Promise<StudentProfileResponseDto> {
    const data = await this.studentService.updateProfileByUserId(userId, dto);
    return {
      success: true,
      data,
    };
  }
}
