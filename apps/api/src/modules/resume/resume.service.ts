import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import * as path from 'path';
import { QueueService } from '../../core/queue/queue.service';
import {
  QUEUE_NAMES,
  ResumeTextExtractionJobData,
} from '../../core/queue/queue.types';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentService } from '../student/student.service';
import { ResumeListItemDto } from './dto/resume-response.dto';
import { UploadResumeData } from './dto/upload-resume-response.dto';
import { UploadedFile } from './interfaces/uploaded-file.interface';
import { ResumeStorageService } from './storage/resume-storage.service';

const PDF_MAGIC_BYTES = Buffer.from('%PDF-'); // 0x25 0x50 0x44 0x46 0x2D
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB (5,242,880 bytes)

@Injectable()
export class ResumeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentService: StudentService,
    private readonly resumeStorageService: ResumeStorageService,
    private readonly queueService: QueueService
  ) {}

  /**
   * Validates uploaded file against API.md §6.1 requirements:
   * - presence
   * - .pdf extension
   * - %PDF- magic bytes signature
   * - 5MB maximum file size
   */
  validateUploadedPdf(file?: UploadedFile): asserts file is UploadedFile {
    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'No file uploaded',
      });
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new HttpException(
        {
          code: 'VALIDATION_ERROR',
          message: 'File exceeds 5MB size limit',
        },
        HttpStatus.PAYLOAD_TOO_LARGE
      );
    }

    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext !== '.pdf') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'File must be a valid PDF (invalid extension)',
      });
    }

    if (
      file.buffer.length < 5 ||
      !file.buffer.subarray(0, 5).equals(PDF_MAGIC_BYTES)
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'File must be a valid PDF (magic byte signature mismatch)',
      });
    }
  }

  /**
   * Uploads and registers a new resume for the authenticated student.
   * Adheres to docs/API.md §6.1.
   */
  async uploadResume(
    userId: string,
    file?: UploadedFile
  ): Promise<UploadResumeData> {
    // 1. Validate file constraints
    this.validateUploadedPdf(file);

    // 2. Resolve authenticated student profile to enforce ownership
    const student = await this.studentService.getProfileByUserId(userId);

    // 3. Store file via storage abstraction
    const uploadResult = await this.resumeStorageService.uploadFile({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
      studentId: student.id,
    });

    // 4. Atomically persist resume record and unset previous primary resumes
    try {
      const resume = await this.prisma.$transaction(async (tx) => {
        // Unset is_primary on previous resumes of this student
        await tx.resume.updateMany({
          where: {
            student_id: student.id,
            is_primary: true,
          },
          data: {
            is_primary: false,
          },
        });

        // Create new primary resume record
        return await tx.resume.create({
          data: {
            student_id: student.id,
            file_url: uploadResult.fileUrl,
            parsed_text: null,
            is_primary: true,
          },
          select: {
            id: true,
            file_url: true,
            is_primary: true,
          },
        });
      });

      // 5. Enqueue background text extraction job
      await this.queueService.send<ResumeTextExtractionJobData>(
        QUEUE_NAMES.RESUME_TEXT_EXTRACTION,
        {
          resumeId: resume.id,
          studentId: student.id,
          fileKey: uploadResult.fileKey,
        },
        {
          singletonKey: resume.id,
          retryLimit: 3,
          retryDelay: 10,
          retryBackoff: true,
        }
      );

      return {
        id: resume.id,
        file_url: resume.file_url,
        is_primary: resume.is_primary,
        message: 'Resume uploaded successfully. Text extraction queued.',
      };
    } catch (dbError) {
      // Rollback storage artifact to prevent orphaned files
      await this.resumeStorageService.deleteFile(uploadResult.fileKey);
      throw dbError;
    }
  }

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
