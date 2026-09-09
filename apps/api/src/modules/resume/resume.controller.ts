import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ResumeListResponseDto } from './dto/resume-response.dto';
import { ResumeService } from './resume.service';

@Controller('resumes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  /**
   * 6.2 List Student's Resumes
   * GET /api/v1/resumes/me
   */
  @Get('me')
  async listMyResumes(
    @CurrentUser('userId') userId: string
  ): Promise<ResumeListResponseDto> {
    const data = await this.resumeService.getStudentResumes(userId);
    return {
      success: true,
      data,
    };
  }
}
