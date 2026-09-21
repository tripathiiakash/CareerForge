import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
import { UserRole } from '@prisma/client';
import { QueueService } from '../../core/queue/queue.service';
import {
  QUEUE_NAMES,
  ResumeTextExtractionJobData,
} from '../../core/queue/queue.types';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentService } from '../student/student.service';
import { ApplicationService } from '../application/application.service';
import { ResumeListItemDto } from './dto/resume-response.dto';
import { UploadResumeData } from './dto/upload-resume-response.dto';
import { UploadedFile } from './interfaces/uploaded-file.interface';
import { ResumeStorageService } from './storage/resume-storage.service';
import {
  StorageFileNotFoundError,
  StorageInvalidKeyError,
} from './storage/storage.interface';
import { isValidUuid } from '../../core/utils/uuid.util';

const PDF_MAGIC_BYTES = Buffer.from('%PDF-'); // 0x25 0x50 0x44 0x46 0x2D
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB (5,242,880 bytes)

@Injectable()
export class ResumeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentService: StudentService,
    private readonly resumeStorageService: ResumeStorageService,
    private readonly queueService: QueueService,
    private readonly applicationService: ApplicationService
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
            file_key: uploadResult.fileKey,
            file_url: uploadResult.fileUrl,
            parsed_text: null,
            is_primary: true,
          },
          select: {
            id: true,
            file_key: true,
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

  /**
   * 6.3 Retrieves a resume file buffer and metadata for authenticated viewing / download.
   * Enforces strict ownership checks (API.md & security boundary).
   * Uses canonical storage file_key directly without fragile URL parsing (ENG-01).
   */
  async getResumeFile(
    userId: string,
    userRole: UserRole,
    identifier: string
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const isUuid = isValidUuid(identifier);

    const resume = await this.prisma.resume.findFirst({
      where: isUuid
        ? { id: identifier }
        : {
            OR: [
              { file_key: identifier },
              { file_url: identifier },
              { file_url: { endsWith: `/${identifier}` } },
            ],
          },
      include: {
        student: {
          select: {
            id: true,
            user_id: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });

    if (!resume) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Resume not found',
      });
    }

    // Enforce authorization & ownership
    if (userRole === UserRole.STUDENT) {
      if (resume.student.user_id !== userId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Access denied: this resume belongs to another student',
        });
      }
    } else if (userRole === UserRole.RECRUITER) {
      // Recruiter may only access if the student applied to a job posted by this recruiter
      const hasApplication =
        await this.applicationService.hasRecruiterAccessToResume(
          resume.id,
          userId
        );

      if (!hasApplication) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message:
            'Access denied: applicant resume does not belong to your job postings',
        });
      }
    }

    // Canonical storage key lookup with isolated backward-compatibility fallback
    const fileKey =
      resume.file_key || this.extractLegacyFileKey(resume.file_url);
    if (!fileKey) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: 'Resume storage file key could not be determined',
      });
    }

    let buffer: Buffer;
    try {
      buffer = await this.resumeStorageService.getFileBuffer(fileKey);
    } catch (err: unknown) {
      if (err instanceof StorageFileNotFoundError) {
        throw new NotFoundException({
          code: 'FILE_NOT_FOUND',
          message: 'Stored resume file not found',
        });
      }
      if (err instanceof StorageInvalidKeyError) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: err.message,
        });
      }
      throw err;
    }
    const isUuidKey =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i.test(
        fileKey
      );
    const safeFirst = this.sanitizeFilenameComponent(
      resume.student.first_name,
      'Student'
    );
    const safeLast = this.sanitizeFilenameComponent(
      resume.student.last_name,
      'Candidate'
    );
    const humanFileName = `${safeFirst}_${safeLast}_Resume.pdf`;
    const safeKey = this.sanitizeFilenameComponent(fileKey, 'Resume.pdf');
    const fileName = isUuidKey
      ? humanFileName
      : safeKey.endsWith('.pdf')
      ? safeKey
      : `${safeKey}.pdf`;

    return { buffer, fileName };
  }

  /**
   * Sanitizes a string component for safe inclusion in HTTP Content-Disposition headers.
   * Strips quotes, semicolons, control characters, CR, LF, path separators, and collapses whitespace.
   */
  private sanitizeFilenameComponent(
    name?: string | null,
    fallback = ''
  ): string {
    if (!name || typeof name !== 'string') return fallback;
    const cleaned = name
      .replace(/[\x00-\x1F\x7F"'\\;/:\r\n?*<>|]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .trim();
    return cleaned.length > 0 ? cleaned : fallback;
  }

  /**
   * Backward-compatibility fallback for legacy resumes created before Phase 6.3-B (ENG-01)
   * where `file_key` was not explicitly stored.
   * Isolated strictly here to ensure no URL parsing leaks across the rest of the application.
   */
  private extractLegacyFileKey(fileUrl?: string | null): string {
    if (!fileUrl) return '';
    try {
      const parsed = new URL(fileUrl, 'http://localhost');
      const segments = parsed.pathname.split('/').filter(Boolean);
      return segments[segments.length - 1] || '';
    } catch {
      const cleanUrl = fileUrl.split('?')[0];
      const segments = cleanUrl.split('/').filter(Boolean);
      return segments[segments.length - 1] || '';
    }
  }
}
