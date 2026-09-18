import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AnalysisStatus } from '@prisma/client';
import {
  JobEnvelope,
  QUEUE_NAMES,
  ResumeTextExtractionJobData,
} from '../../../core/queue/queue.types';
import { QueueService } from '../../../core/queue/queue.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PdfParserService } from '../services/pdf-parser.service';
import { ResumeStorageService } from '../storage/resume-storage.service';
import {
  StorageError,
  StorageFileNotFoundError,
  StorageInvalidKeyError,
} from '../storage/storage.interface';

@Injectable()
export class ResumeExtractionWorker implements OnModuleInit {
  private readonly logger = new Logger(ResumeExtractionWorker.name);

  constructor(
    private readonly queueService: QueueService,
    private readonly prisma: PrismaService,
    private readonly storageService: ResumeStorageService,
    private readonly pdfParserService: PdfParserService
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log(
      `Registering worker for queue: ${QUEUE_NAMES.RESUME_TEXT_EXTRACTION}`
    );
    await this.queueService.work<ResumeTextExtractionJobData>(
      QUEUE_NAMES.RESUME_TEXT_EXTRACTION,
      this.handleExtractionJob.bind(this)
    );
  }

  async handleExtractionJob(
    job: JobEnvelope<ResumeTextExtractionJobData>
  ): Promise<void> {
    const { resumeId, studentId, fileKey } = job.data;
    this.logger.log(
      `Processing resume text extraction for resume ${resumeId} (job: ${job.id})`
    );

    try {
      // 1. Fetch resume from database
      const resume = await this.prisma.resume.findUnique({
        where: { id: resumeId },
      });

      if (!resume) {
        this.logger.warn(
          `Resume ${resumeId} not found in database. Skipping job ${job.id}.`
        );
        return;
      }

      // 2. Validate student ownership
      if (resume.student_id !== studentId) {
        this.logger.warn(
          `Resume ${resumeId} ownership mismatch. Job student: ${studentId}, DB student: ${resume.student_id}. Skipping job ${job.id}.`
        );
        return;
      }

      // 3. Idempotency guard: if parsed_text is already populated, skip re-parsing
      if (resume.parsed_text && resume.parsed_text.trim().length > 0) {
        this.logger.log(
          `Resume ${resumeId} already has parsed text (${resume.parsed_text.length} chars). Skipping job ${job.id}.`
        );
        return;
      }

      // 4. Retrieve PDF bytes via storage provider abstraction using canonical file_key (ENG-01)
      const targetFileKey =
        fileKey ||
        resume.file_key ||
        this.extractLegacyFileKey(resume.file_url);

      if (!targetFileKey || targetFileKey.trim().length === 0) {
        throw new StorageFileNotFoundError(
          '',
          'Resume storage file key could not be determined'
        );
      }

      const fileBuffer = await this.storageService.getFileBuffer(targetFileKey);

      // 5. Extract text via PdfParserService (handles page limits, null byte sanitization, empty text check)
      const extractedText = await this.pdfParserService.extractText(fileBuffer);

      // 6. Persist parsed text into Resume model
      await this.prisma.resume.update({
        where: { id: resumeId },
        data: {
          parsed_text: extractedText,
        },
      });

      this.logger.log(
        `Successfully extracted and stored parsed text for resume ${resumeId} (${extractedText.length} characters)`
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Handle non-retriable permanent failures (missing file, invalid key, deterministic parser failure)
      if (this.isPermanentError(error)) {
        const safeErrorMessage = this.getSafeErrorMessage(error);

        this.logger.warn(
          `Non-retriable extraction failure for resume ${resumeId}: ${errorMessage}. Recording FAILED state in ai_analyses.`
        );

        await this.prisma.aiAnalysis.upsert({
          where: { resume_id: resumeId },
          create: {
            resume_id: resumeId,
            status: AnalysisStatus.FAILED,
            error_message: safeErrorMessage,
          },
          update: {
            status: AnalysisStatus.FAILED,
            error_message: safeErrorMessage,
          },
        });

        // Do not rethrow; non-retriable errors should not waste pg-boss retry budget
        return;
      }

      this.logger.error(
        `Transient failure processing text extraction for resume ${resumeId}: ${errorMessage}`
      );
      // Rethrow to allow pg-boss to handle retries / backoff for transient infrastructure errors
      throw error;
    }
  }

  /**
   * Determines whether an error during extraction is permanent and should NOT be retried.
   */
  private isPermanentError(error: unknown): boolean {
    // 1. Explicit domain storage errors
    if (error instanceof StorageError && !error.isRetryable) {
      return true;
    }
    if (
      error instanceof StorageFileNotFoundError ||
      error instanceof StorageInvalidKeyError
    ) {
      return true;
    }

    // 2. Deterministic PDF parsing errors (EMPTY_PDF_CONTENT, INVALID_PDF_FORMAT)
    if (error instanceof UnprocessableEntityException) {
      return true;
    }

    // 3. Known permanent HTTP exceptions from storage or validation
    if (error instanceof NotFoundException) {
      return true;
    }
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      const code =
        typeof response === 'object' && response !== null && 'code' in response
          ? (response as { code: string }).code
          : undefined;
      if (
        code === 'FILE_NOT_FOUND' ||
        code === 'VALIDATION_ERROR' ||
        code === 'INVALID_FILE_KEY'
      ) {
        return true;
      }
    }

    // 4. Duck-typed permanent error signals
    if (typeof error === 'object' && error !== null) {
      const code = (error as { code?: string }).code;
      if (
        code === 'ENOENT' ||
        code === 'FILE_NOT_FOUND' ||
        code === 'INVALID_FILE_KEY'
      ) {
        return true;
      }
      if ((error as { isRetryable?: boolean }).isRetryable === false) {
        return true;
      }
    }

    return false;
  }

  /**
   * Produces a sanitized, safe diagnostic message for student-visible analysis failure,
   * completely avoiding internal storage paths, buckets, credentials, or stack traces.
   */
  private getSafeErrorMessage(error: unknown): string {
    if (
      error instanceof StorageFileNotFoundError ||
      (error instanceof NotFoundException &&
        typeof error.getResponse() === 'object' &&
        (error.getResponse() as { code?: string })?.code === 'FILE_NOT_FOUND') ||
      (error instanceof BadRequestException &&
        typeof error.getResponse() === 'object' &&
        (error.getResponse() as { code?: string })?.code === 'FILE_NOT_FOUND') ||
      (typeof error === 'object' &&
        error !== null &&
        (error as { code?: string })?.code === 'FILE_NOT_FOUND')
    ) {
      return 'The uploaded resume file could not be found or accessed. Please re-upload your resume.';
    }

    if (
      error instanceof StorageInvalidKeyError ||
      (error instanceof BadRequestException &&
        typeof error.getResponse() === 'object' &&
        (error.getResponse() as { code?: string })?.code === 'VALIDATION_ERROR') ||
      (typeof error === 'object' &&
        error !== null &&
        (error as { code?: string })?.code === 'INVALID_FILE_KEY')
    ) {
      return 'The resume file reference is invalid or corrupted. Please re-upload your resume.';
    }

    if (error instanceof UnprocessableEntityException) {
      return 'Failed to parse resume text. Please ensure the PDF is not password-protected or an image scan.';
    }

    return 'Failed to process resume file. Please ensure the document is a valid PDF.';
  }

  /**
   * Backward-compatibility fallback for legacy resumes created before Phase 6.3-B (ENG-01)
   * where `file_key` was not explicitly passed or stored.
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
