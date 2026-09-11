import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  JobEnvelope,
  QUEUE_NAMES,
  ResumeTextExtractionJobData,
} from '../../../core/queue/queue.types';
import { QueueService } from '../../../core/queue/queue.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PdfParserService } from '../services/pdf-parser.service';
import { ResumeStorageService } from '../storage/resume-storage.service';

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

      // 4. Retrieve PDF bytes via storage provider abstraction
      const targetFileKey =
        fileKey ||
        (resume.file_url ? resume.file_url.split('/').pop() || '' : '');
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
      this.logger.error(
        `Failed to process text extraction for resume ${resumeId}: ${errorMessage}`
      );
      // Rethrow to allow pg-boss to handle retries / backoff
      throw error;
    }
  }
}
