import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { GetAnalysisResponseDto } from './dto/get-analysis-response.dto';
import { ResumeListResponseDto } from './dto/resume-response.dto';
import { TriggerAnalysisResponseDto } from './dto/trigger-analysis-response.dto';
import { UploadResumeResponseDto } from './dto/upload-resume-response.dto';
import { UploadedFile as IUploadedFile } from './interfaces/uploaded-file.interface';
import { ResumeAnalysisService } from './services/resume-analysis.service';
import { ResumeService } from './resume.service';

@Controller('resumes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class ResumeController {
  constructor(
    private readonly resumeService: ResumeService,
    private readonly resumeAnalysisService: ResumeAnalysisService
  ) {}

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

  /**
   * 7.1 Trigger Resume Analysis
   * POST /api/v1/resumes/:resumeId/analyze
   */
  @Post(':resumeId/analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerAnalysis(
    @CurrentUser('userId') userId: string,
    @Param('resumeId') resumeId: string
  ): Promise<TriggerAnalysisResponseDto> {
    const data = await this.resumeAnalysisService.triggerAnalysis(
      userId,
      resumeId
    );
    return {
      success: true,
      data,
    };
  }

  /**
   * 7.2 Get Resume Analysis Results
   * GET /api/v1/resumes/:resumeId/analysis
   */
  @Get(':resumeId/analysis')
  async getAnalysis(
    @CurrentUser('userId') userId: string,
    @Param('resumeId') resumeId: string
  ): Promise<GetAnalysisResponseDto> {
    const data = await this.resumeAnalysisService.getAnalysis(userId, resumeId);
    return {
      success: true,
      data,
    };
  }
}
