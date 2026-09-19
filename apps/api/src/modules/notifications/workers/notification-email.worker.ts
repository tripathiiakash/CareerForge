import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QueueService } from '../../../core/queue/queue.service';
import {
  ApplicationStatusEmailJobData,
  ApplicationSubmittedRecruiterEmailJobData,
  ApplicationSubmittedStudentEmailJobData,
  JobEnvelope,
  QUEUE_NAMES,
  WelcomeEmailJobData,
} from '../../../core/queue/queue.types';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import {
  maskEmailsInText,
  sanitizeEmailLogText,
} from '../email/email-sanitizer.util';

/**
 * NotificationEmailWorker handles asynchronous dispatch of transactional emails.
 * Consumes events triggered by user registration, job application submission,
 * and application status updates from pg-boss queues.
 */
@Injectable()
export class NotificationEmailWorker implements OnModuleInit {
  private readonly logger = new Logger(NotificationEmailWorker.name);

  constructor(
    private readonly queueService: QueueService,
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Registering notification email queue workers...');

    await Promise.all([
      this.queueService.work<WelcomeEmailJobData>(
        QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME,
        this.handleWelcomeJob.bind(this)
      ),
      this.queueService.work<ApplicationSubmittedStudentEmailJobData>(
        QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_SUBMITTED_STUDENT,
        this.handleApplicationSubmittedStudentJob.bind(this)
      ),
      this.queueService.work<ApplicationSubmittedRecruiterEmailJobData>(
        QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_SUBMITTED_RECRUITER,
        this.handleApplicationSubmittedRecruiterJob.bind(this)
      ),
      this.queueService.work<ApplicationStatusEmailJobData>(
        QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_STATUS,
        this.handleApplicationStatusJob.bind(this)
      ),
    ]);

    this.logger.log(
      'Notification email queue workers registered successfully.'
    );
  }

  /**
   * Processes welcome email for newly registered user.
   */
  async handleWelcomeJob(job: JobEnvelope<WelcomeEmailJobData>): Promise<void> {
    const { userId, email, role } = job.data;
    const retryCount = job.retryCount ?? 0;
    const retryLimit = job.retryLimit ?? 3;
    const queueName = job.name || QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME;

    this.logger.log(
      `Processing welcome email for user ${userId} (${role}) [queue: ${queueName}, job: ${job.id}, attempt: ${retryCount + 1}/${retryLimit + 1}]`
    );

    // 1. Verify user exists in database and is active
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      this.logger.warn(
        `User ${userId} not found in database. Skipping welcome email [job: ${job.id}].`
      );
      return;
    }

    if (user.is_banned) {
      this.logger.warn(
        `User ${userId} is banned. Skipping welcome email [job: ${job.id}].`
      );
      return;
    }

    const recipientEmail = (user.email || email || '').trim();
    if (!recipientEmail || !recipientEmail.includes('@')) {
      this.logger.warn(
        `Invalid recipient email for user ${userId}. Skipping welcome email.`
      );
      return;
    }

    // 2. Format role-specific welcome message
    const isStudent = role === 'STUDENT';
    const subject = isStudent
      ? 'Welcome to CareerForge!'
      : 'Welcome to CareerForge for Employers!';

    const text = isStudent
      ? `Welcome to CareerForge!\n\nYour student account is now active. You can now build your profile, upload your resume for instant AI analysis, and apply to top jobs and internships.\n\nBest regards,\nThe CareerForge Team`
      : `Welcome to CareerForge!\n\nYour recruiter account is now active. You can now configure your company profile, post job openings, and connect with top student talent.\n\nBest regards,\nThe CareerForge Team`;

    const html = isStudent
      ? `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
           <h2>Welcome to CareerForge!</h2>
           <p>Your student account is now active.</p>
           <p>Get started with these next steps:</p>
           <ul>
             <li>Complete your student profile with your education and skills.</li>
             <li>Upload your resume for automated AI-powered analysis and feedback.</li>
             <li>Explore and apply for active job and internship openings.</li>
           </ul>
           <p>Best regards,<br/>The CareerForge Team</p>
         </div>`
      : `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
           <h2>Welcome to CareerForge for Employers!</h2>
           <p>Your recruiter account is now active.</p>
           <p>Get started with these next steps:</p>
           <ul>
             <li>Verify your company profile and details.</li>
             <li>Post new job and internship opportunities.</li>
             <li>Review candidates and manage applications seamlessly.</li>
           </ul>
           <p>Best regards,<br/>The CareerForge Team</p>
         </div>`;

    // 3. Dispatch email through provider abstraction with deterministic idempotency
    const idempotencyKey = `email:welcome:${userId}`;
    await this.dispatchIdempotentEmail({
      idempotencyKey,
      eventType: 'welcome',
      recipientEmail,
      subject,
      text,
      html,
      jobId: job.id,
    });

    this.logger.log(
      `Welcome email delivered successfully for user ${userId} [job: ${job.id}]`
    );
  }

  /**
   * Processes application submission confirmation to the student.
   */
  async handleApplicationSubmittedStudentJob(
    job: JobEnvelope<ApplicationSubmittedStudentEmailJobData>
  ): Promise<void> {
    const { applicationId } = job.data;
    const retryCount = job.retryCount ?? 0;
    const retryLimit = job.retryLimit ?? 3;
    const queueName =
      job.name || QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_SUBMITTED_STUDENT;

    this.logger.log(
      `Processing student application confirmation for application ${applicationId} [queue: ${queueName}, job: ${job.id}, attempt: ${retryCount + 1}/${retryLimit + 1}]`
    );

    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        student: {
          include: { user: true },
        },
        job: {
          include: { company: true },
        },
      },
    });

    if (
      !application ||
      !application.student ||
      !application.student.user ||
      !application.job
    ) {
      this.logger.warn(
        `Application ${applicationId} or associated entities not found. Skipping student confirmation [job: ${job.id}].`
      );
      return;
    }

    const recipientEmail = application.student.user.email?.trim();
    if (!recipientEmail || !recipientEmail.includes('@')) {
      this.logger.warn(
        `Invalid recipient email for student in application ${applicationId}. Skipping.`
      );
      return;
    }

    const studentName =
      `${application.student.first_name || ''} ${application.student.last_name || ''}`.trim() ||
      'Candidate';
    const jobTitle = application.job.title;
    const companyName = application.job.company?.name || 'the employer';

    const subject = `Application Received: ${jobTitle} at ${companyName}`;
    const text = `Hello ${studentName},\n\nYour application for "${jobTitle}" at ${companyName} has been successfully submitted.\n\nThe hiring team has received your application and will review your profile. You can track your application status anytime from your CareerForge dashboard.\n\nBest regards,\nThe CareerForge Team`;
    const html = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
         <h2>Application Received!</h2>
         <p>Hello ${studentName},</p>
         <p>Your application for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> has been successfully submitted.</p>
         <p>The hiring team has received your application and will review your profile. You can check the current status of your application anytime in your student dashboard.</p>
         <p>Best regards,<br/>The CareerForge Team</p>
       </div>`;

    const idempotencyKey = `email:app-sub-student:${applicationId}`;
    await this.dispatchIdempotentEmail({
      idempotencyKey,
      eventType: 'application_submitted_student',
      recipientEmail,
      subject,
      text,
      html,
      jobId: job.id,
    });

    this.logger.log(
      `Student application confirmation sent for application ${applicationId} [job: ${job.id}]`
    );
  }

  /**
   * Processes new applicant notification to the recruiter.
   */
  async handleApplicationSubmittedRecruiterJob(
    job: JobEnvelope<ApplicationSubmittedRecruiterEmailJobData>
  ): Promise<void> {
    const { applicationId } = job.data;
    const retryCount = job.retryCount ?? 0;
    const retryLimit = job.retryLimit ?? 3;
    const queueName =
      job.name || QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_SUBMITTED_RECRUITER;

    this.logger.log(
      `Processing recruiter applicant alert for application ${applicationId} [queue: ${queueName}, job: ${job.id}, attempt: ${retryCount + 1}/${retryLimit + 1}]`
    );

    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        student: true,
        job: {
          include: {
            recruiter: {
              include: { user: true },
            },
            company: true,
          },
        },
      },
    });

    if (
      !application ||
      !application.job ||
      !application.job.recruiter ||
      !application.job.recruiter.user
    ) {
      this.logger.warn(
        `Application ${applicationId} or associated recruiter not found. Skipping recruiter notification [job: ${job.id}].`
      );
      return;
    }

    const recipientEmail = application.job.recruiter.user.email?.trim();
    if (!recipientEmail || !recipientEmail.includes('@')) {
      this.logger.warn(
        `Invalid recipient email for recruiter in application ${applicationId}. Skipping.`
      );
      return;
    }

    const recruiterName =
      `${application.job.recruiter.first_name || ''} ${application.job.recruiter.last_name || ''}`.trim() ||
      'Hiring Manager';
    const applicantName =
      `${application.student?.first_name || ''} ${application.student?.last_name || ''}`.trim() ||
      'A candidate';
    const jobTitle = application.job.title;
    const companyName = application.job.company?.name || 'your company';

    const subject = `New Applicant for ${jobTitle}: ${applicantName}`;
    const text = `Hello ${recruiterName},\n\n${applicantName} has applied for "${jobTitle}" at ${companyName}.\n\nYou can review their application and qualifications in your recruiter dashboard.\n\nBest regards,\nThe CareerForge Team`;
    const html = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
         <h2>New Application Received</h2>
         <p>Hello ${recruiterName},</p>
         <p><strong>${applicantName}</strong> has submitted an application for <strong>${jobTitle}</strong> at <strong>${companyName}</strong>.</p>
         <p>Visit your recruiter dashboard to inspect the candidate's qualifications, skills, and manage their application status.</p>
         <p>Best regards,<br/>The CareerForge Team</p>
       </div>`;

    const idempotencyKey = `email:app-sub-recruiter:${applicationId}`;
    await this.dispatchIdempotentEmail({
      idempotencyKey,
      eventType: 'application_submitted_recruiter',
      recipientEmail,
      subject,
      text,
      html,
      jobId: job.id,
    });

    this.logger.log(
      `Recruiter application alert sent for application ${applicationId} [job: ${job.id}]`
    );
  }

  /**
   * Processes application status update notification to the student (SHORTLISTED or REJECTED).
   */
  async handleApplicationStatusJob(
    job: JobEnvelope<ApplicationStatusEmailJobData>
  ): Promise<void> {
    const { applicationId, status } = job.data;
    const retryCount = job.retryCount ?? 0;
    const retryLimit = job.retryLimit ?? 3;
    const queueName =
      job.name || QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_STATUS;

    this.logger.log(
      `Processing status update (${status}) for application ${applicationId} [queue: ${queueName}, job: ${job.id}, attempt: ${retryCount + 1}/${retryLimit + 1}]`
    );

    if (status !== 'SHORTLISTED' && status !== 'REJECTED') {
      this.logger.warn(
        `Application status ${status} does not require an email notification. Skipping [job: ${job.id}].`
      );
      return;
    }

    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        student: {
          include: { user: true },
        },
        job: {
          include: { company: true },
        },
      },
    });

    if (
      !application ||
      !application.student ||
      !application.student.user ||
      !application.job
    ) {
      this.logger.warn(
        `Application ${applicationId} or associated entities not found. Skipping status notification [job: ${job.id}].`
      );
      return;
    }

    const recipientEmail = application.student.user.email?.trim();
    if (!recipientEmail || !recipientEmail.includes('@')) {
      this.logger.warn(
        `Invalid recipient email for student in application ${applicationId}. Skipping.`
      );
      return;
    }

    const studentName =
      `${application.student.first_name || ''} ${application.student.last_name || ''}`.trim() ||
      'Candidate';
    const jobTitle = application.job.title;
    const companyName = application.job.company?.name || 'the employer';

    let subject: string;
    let text: string;
    let html: string;

    if (status === 'SHORTLISTED') {
      subject = `Great News: You have been shortlisted for ${jobTitle} at ${companyName}!`;
      text = `Hello ${studentName},\n\nCongratulations! Your application for "${jobTitle}" at ${companyName} has been shortlisted by the hiring team.\n\nThe recruiter will contact you directly with next steps or interview schedules. Be sure to check your dashboard for further updates.\n\nBest regards,\nThe CareerForge Team`;
      html = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
           <h2 style="color: #10b981;">Application Status: Shortlisted!</h2>
           <p>Hello ${studentName},</p>
           <p>Congratulations! Your application for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> has been shortlisted by the hiring team.</p>
           <p>The recruiter will contact you regarding next steps or interview details. You can also prepare for your interview using CareerForge's AI Interview Preparation tools.</p>
           <p>Best regards,<br/>The CareerForge Team</p>
         </div>`;
    } else {
      subject = `Update on your application for ${jobTitle} at ${companyName}`;
      text = `Hello ${studentName},\n\nThank you for your interest in the "${jobTitle}" role at ${companyName}.\n\nAfter careful consideration, the hiring team has decided not to move forward with your application at this time.\n\nWe encourage you to explore and apply for other opportunities on CareerForge that match your background and skills.\n\nBest regards,\nThe CareerForge Team`;
      html = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
           <h2>Application Status Update</h2>
           <p>Hello ${studentName},</p>
           <p>Thank you for taking the time to apply for <strong>${jobTitle}</strong> at <strong>${companyName}</strong>.</p>
           <p>After careful review, the hiring team has decided to proceed with other candidates whose qualifications more closely align with their current requirements.</p>
           <p>We encourage you to continue applying for other exciting opportunities on CareerForge that match your goals.</p>
           <p>Best regards,<br/>The CareerForge Team</p>
         </div>`;
    }

    const idempotencyKey = job.data.eventId
      ? `email:app-status:${job.data.eventId}`
      : `email:app-status:${applicationId}:${status}`;
    await this.dispatchIdempotentEmail({
      idempotencyKey,
      eventType: 'application_status',
      recipientEmail,
      subject,
      text,
      html,
      jobId: job.id,
    });

    this.logger.log(
      `Status update email (${status}) delivered for application ${applicationId} [job: ${job.id}]`
    );
  }

  private static readonly STALE_PENDING_THRESHOLD_MS = 15_000;

  /**
   * Dispatches a transactional email idempotently using database-backed delivery markers
   * and provider-level idempotency headers.
   */
  private async dispatchIdempotentEmail(params: {
    idempotencyKey: string;
    eventType: string;
    recipientEmail: string;
    subject: string;
    text?: string;
    html?: string;
    jobId: string;
  }): Promise<void> {
    const {
      idempotencyKey,
      eventType,
      recipientEmail,
      subject,
      text,
      html,
      jobId,
    } = params;

    let effectiveRecipient = recipientEmail;
    let effectiveSubject = subject;
    let effectiveText = text;
    let effectiveHtml = html;

    // 1. If database delivery model is available on prisma, manage lifecycle
    if (this.prisma && this.prisma.emailDelivery) {
      const existing = await this.prisma.emailDelivery.findUnique({
        where: { idempotency_key: idempotencyKey },
      });

      // 1.1 If already delivered, skip immediately (exactly-once logical delivery)
      if (existing && existing.status === 'SENT') {
        this.logger.log(
          `Transactional email with idempotency key ${idempotencyKey} already delivered (messageId: ${existing.message_id || 'unknown'}). Skipping duplicate delivery [job: ${jobId}].`
        );
        return;
      }

      // 1.2 If currently PENDING, check if an active worker is in-flight vs crashed
      if (existing && existing.status === 'PENDING') {
        const lastUpdated = new Date(
          existing.updated_at || existing.created_at
        ).getTime();
        const ageMs = Date.now() - lastUpdated;

        if (ageMs < NotificationEmailWorker.STALE_PENDING_THRESHOLD_MS) {
          // Another worker is actively executing — wait cooperatively
          const outcome = await this.waitForInFlightDelivery(
            idempotencyKey,
            jobId
          );
          if (outcome === 'SENT') {
            return;
          }
        }
      }

      let deliveryRecord = existing;

      // 1.3 If no record exists, insert PENDING record atomically with immutable payload snapshot
      if (!existing) {
        try {
          deliveryRecord = await this.prisma.emailDelivery.create({
            data: {
              idempotency_key: idempotencyKey,
              event_type: eventType,
              recipient_email: recipientEmail,
              subject,
              body_text: text || null,
              body_html: html || null,
              status: 'PENDING',
              attempts: 1,
            },
          });
        } catch (err: unknown) {
          // Handle unique constraint conflict across concurrent workers (Prisma P2002)
          const isConflict =
            (err &&
              typeof err === 'object' &&
              'code' in err &&
              (err as { code: string }).code === 'P2002') ||
            (err instanceof Error &&
              err.message.includes('Unique constraint failed'));

          if (isConflict) {
            const outcome = await this.waitForInFlightDelivery(
              idempotencyKey,
              jobId
            );
            if (outcome === 'SENT') {
              return;
            }
            deliveryRecord = await this.prisma.emailDelivery.findUnique({
              where: { idempotency_key: idempotencyKey },
            });
          } else {
            throw err;
          }
        }
      } else {
        // Record existed in FAILED state, or was stale PENDING after worker crash: reclaim lease & retry
        try {
          deliveryRecord = await this.prisma.emailDelivery.update({
            where: { idempotency_key: idempotencyKey },
            data: {
              status: 'PENDING',
              attempts: { increment: 1 },
              updated_at: new Date(),
            },
          });
        } catch (updateErr: unknown) {
          this.logger.warn(
            sanitizeEmailLogText(
              `Could not increment attempts for ${idempotencyKey}: ${updateErr instanceof Error ? updateErr.message : 'Unknown'}`
            )
          );
        }
      }

      // Reconstruct payload from the immutable snapshot stored in the delivery record.
      // This guarantees that retries send the exact byte-for-byte identical payload to Resend,
      // preventing HTTP 409 invalid_idempotent_request even if underlying entities were mutated.
      const snapshot = deliveryRecord || existing;
      if (snapshot) {
        effectiveRecipient = snapshot.recipient_email || recipientEmail;
        effectiveSubject = snapshot.subject || subject;
        const withBodies = snapshot as {
          body_text?: string | null;
          body_html?: string | null;
        };
        if (withBodies.body_text !== undefined && withBodies.body_text !== null) {
          effectiveText = withBodies.body_text;
        }
        if (withBodies.body_html !== undefined && withBodies.body_html !== null) {
          effectiveHtml = withBodies.body_html;
        }
      }
    }

    // 2. Dispatch to email provider using deterministic idempotency key and immutable payload snapshot
    try {
      const result = await this.emailService.sendEmail({
        to: effectiveRecipient,
        subject: effectiveSubject,
        text: effectiveText,
        html: effectiveHtml,
        idempotencyKey,
      });

      // 3. Mark delivery SENT in database upon success
      if (this.prisma && this.prisma.emailDelivery) {
        await this.prisma.emailDelivery.update({
          where: { idempotency_key: idempotencyKey },
          data: {
            status: 'SENT',
            message_id: result.messageId || null,
            sent_at: new Date(),
            error_message: null,
          },
        });
      }
    } catch (error: unknown) {
      // 4. Handle provider response or failure
      const is409 =
        (error &&
          typeof error === 'object' &&
          'statusCode' in error &&
          (error as { statusCode?: number }).statusCode === 409) ||
        (error instanceof Error &&
          error.message.includes('concurrent_idempotent_requests'));

      if (is409) {
        this.logger.warn(
          `Concurrent request in-flight at provider for ${idempotencyKey} (HTTP 409). Rethrowing for queue retry.`
        );
      }

      const rawError =
        error instanceof Error ? error.message : 'Unknown delivery error';
      const safeError = maskEmailsInText(rawError);

      if (this.prisma && this.prisma.emailDelivery) {
        try {
          await this.prisma.emailDelivery.update({
            where: { idempotency_key: idempotencyKey },
            data: {
              status: is409 ? 'PENDING' : 'FAILED',
              error_message: safeError,
            },
          });
        } catch (dbErr: unknown) {
          this.logger.error(
            sanitizeEmailLogText(
              `Failed to record email delivery state in database for ${idempotencyKey}: ${dbErr instanceof Error ? dbErr.message : 'Unknown'}`
            )
          );
        }
      }

      // Rethrow to allow pg-boss backoff and retry
      throw error;
    }
  }

  /**
   * Cooperatively waits for an in-flight concurrent worker to finalize email delivery.
   */
  private async waitForInFlightDelivery(
    idempotencyKey: string,
    jobId: string
  ): Promise<'SENT' | 'FAILED' | 'TIMEOUT'> {
    let waitedMs = 0;
    const maxWaitMs = 2500;
    const intervalMs = 50;

    while (waitedMs < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      waitedMs += intervalMs;

      const current = await this.prisma.emailDelivery.findUnique({
        where: { idempotency_key: idempotencyKey },
      });

      if (current && current.status === 'SENT') {
        this.logger.log(
          `Transactional email with idempotency key ${idempotencyKey} was delivered concurrently. Skipping [job: ${jobId}].`
        );
        return 'SENT';
      }

      if (current && current.status === 'FAILED') {
        return 'FAILED';
      }
    }

    const current = await this.prisma.emailDelivery.findUnique({
      where: { idempotency_key: idempotencyKey },
    });

    if (current && current.status === 'SENT') {
      this.logger.log(
        `Transactional email with idempotency key ${idempotencyKey} was delivered concurrently. Skipping [job: ${jobId}].`
      );
      return 'SENT';
    }

    return 'TIMEOUT';
  }
}
