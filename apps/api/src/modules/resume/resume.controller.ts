import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ResumeListResponseDto } from './dto/resume-response.dto';
import { UploadResumeResponseDto } from './dto/upload-resume-response.dto';
import { UploadedFile as IUploadedFile } from './interfaces/uploaded-file.interface';
import { ResumeService } from './resume.service';

@Controller('resumes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  /**
   * 6.1 Upload Resume
   * POST /api/v1/resumes/upload
   */
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    })
  )
  async uploadResume(
    @CurrentUser('userId') userId: string,
    @UploadedFile() file?: IUploadedFile
  ): Promise<UploadResumeResponseDto> {
    const data = await this.resumeService.uploadResume(userId, file);
    return {
      success: true,
      data,
    };
  }

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
