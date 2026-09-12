import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  listStudentApplicationsQuerySchema,
  updateStudentProfileSchema,
} from '@careerforge/validation';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { ApplicationService } from '../application/application.service';
import { ListStudentApplicationsResponseDto } from '../application/dto/application-response.dto';
import { ListStudentApplicationsQueryDto } from '../application/dto/list-student-applications-query.dto';
import { StudentProfileResponseDto } from './dto/student-profile-response.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { StudentService } from './student.service';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class StudentController {
  constructor(
    private readonly studentService: StudentService,
    private readonly applicationService: ApplicationService
  ) {}

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

  /**
   * 2.3 Get Student's Applications
   * GET /api/v1/students/me/applications
   */
  @Get('me/applications')
  @HttpCode(HttpStatus.OK)
  async getMyApplications(
    @CurrentUser('userId') userId: string,
    @Query(new ZodValidationPipe(listStudentApplicationsQuerySchema))
    query: ListStudentApplicationsQueryDto
  ): Promise<ListStudentApplicationsResponseDto> {
    const { data, meta } = await this.applicationService.getStudentApplications(
      userId,
      query
    );
    return {
      success: true,
      data,
      meta,
    };
  }
}
