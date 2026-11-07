import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QueueService } from '../../../core/queue/queue.service';
import {
  ApplicationStatusEmailJobData,
  ApplicationSubmittedRecruiterEmailJobData,
  ApplicationSubmittedStudentEmailJobData,
  JobEnvelope,
  JobModerationEmailJobData,
  QUEUE_NAMES,
  RecruiterVerificationStatusEmailJobData,
  RecruiterVerificationSubmittedEmailJobData,
  WelcomeEmailJobData,
} from '../../../core/queue/queue.types';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import {
  maskEmailsInText,
  sanitizeEmailLogText,
} from '../email/email-sanitizer.util';

function escapeHtml(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
      this.queueService.work<RecruiterVerificationSubmittedEmailJobData>(
        QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_SUBMITTED,
        this.handleRecruiterVerificationSubmittedJob.bind(this)
      ),
      this.queueService.work<RecruiterVerificationStatusEmailJobData>(
        QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_STATUS,
        this.handleRecruiterVerificationStatusJob.bind(this)
      ),
      this.queueService.work<JobModerationEmailJobData>(
        QUEUE_NAMES.NOTIFICATION_EMAIL_JOB_MODERATION,
        this.handleJobModerationJob.bind(this)
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

  /**
   * Processes confirmation email to recruiter when organization verification is submitted or resubmitted.
   */
  async handleRecruiterVerificationSubmittedJob(
    job: JobEnvelope<RecruiterVerificationSubmittedEmailJobData>
  ): Promise<void> {
    const { recruiterId, isResubmission } = job.data;
    const retryCount = job.retryCount ?? 0;
    const retryLimit = job.retryLimit ?? 3;
    const queueName =
      job.name ||
      QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_SUBMITTED;

    this.logger.log(
      `Processing recruiter verification ${isResubmission ? 'resubmission' : 'submission'} confirmation for recruiter ${recruiterId} [queue: ${queueName}, job: ${job.id}, attempt: ${retryCount + 1}/${retryLimit + 1}]`
    );

    const recruiter = await this.prisma.recruiter.findUnique({
      where: { id: recruiterId },
      include: {
        user: true,
        company: true,
        verification: true,
      },
    });

    if (!recruiter || !recruiter.user) {
      this.logger.warn(
        `Recruiter ${recruiterId} or associated user not found. Skipping verification confirmation [job: ${job.id}].`
      );
      return;
    }

    if (recruiter.user.is_banned) {
      this.logger.warn(
        `User for recruiter ${recruiterId} is banned. Skipping verification confirmation [job: ${job.id}].`
      );
      return;
    }

    const recipientEmail = recruiter.user.email?.trim();
    if (!recipientEmail || !recipientEmail.includes('@')) {
      this.logger.warn(
        `Invalid recipient email for recruiter ${recruiterId}. Skipping verification confirmation.`
      );
      return;
    }

    const recruiterName =
      `${recruiter.first_name || ''} ${recruiter.last_name || ''}`.trim() ||
      'Recruiter';
    const orgName =
      recruiter.verification?.organization_name ||
      recruiter.company?.name ||
      'your organization';

    const safeRecruiterName = escapeHtml(recruiterName);
    const safeOrgName = escapeHtml(orgName);

    const subject = isResubmission
      ? `Organization Verification Resubmitted: ${orgName}`
      : `Organization Verification Submitted: ${orgName}`;

    const text = isResubmission
      ? `Hello ${recruiterName},\n\nThank you for updating your organization details for "${orgName}".\n\nOur administration team has received your updated submission and will re-evaluate your organization profile. We will notify you by email once the review is finalized.\n\nYou can track your verification status anytime from your CareerForge dashboard.\n\nBest regards,\nThe CareerForge Team`
      : `Hello ${recruiterName},\n\nThank you for submitting organization verification details for "${orgName}".\n\nOur administration team has received your submission and will review your credentials shortly. You will receive an email update once your verification has been reviewed.\n\nYou can check your current verification status at any time from your CareerForge dashboard.\n\nBest regards,\nThe CareerForge Team`;

    const html = isResubmission
      ? `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
           <h2>Verification Details Resubmitted</h2>
           <p>Hello ${safeRecruiterName},</p>
           <p>Thank you for updating your organization details for <strong>${safeOrgName}</strong>.</p>
           <p>Our administration team has received your updated submission and will re-evaluate your organization profile. We will notify you by email once the review is finalized.</p>
           <p>You can track your verification status anytime from your CareerForge recruiter dashboard.</p>
           <p>Best regards,<br/>The CareerForge Team</p>
         </div>`
      : `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
           <h2>Verification Details Received</h2>
           <p>Hello ${safeRecruiterName},</p>
           <p>Thank you for submitting organization verification details for <strong>${safeOrgName}</strong>.</p>
           <p>Our administration team has received your submission and will review your credentials shortly. You will receive an email notification once your verification has been reviewed.</p>
           <p>You can check your current verification status at any time from your CareerForge recruiter dashboard.</p>
           <p>Best regards,<br/>The CareerForge Team</p>
         </div>`;

    const idempotencyKey = job.data.eventId
      ? `email:recruiter-verif-sub:${job.data.eventId}`
      : isResubmission
        ? `email:recruiter-verif-resub:${recruiterId}:${recruiter.verification?.updated_at?.getTime() || 'latest'}`
        : `email:recruiter-verif-sub:${recruiterId}`;

    await this.dispatchIdempotentEmail({
      idempotencyKey,
      eventType: isResubmission
        ? 'recruiter_verification_resubmitted'
        : 'recruiter_verification_submitted',
      recipientEmail,
      subject,
      text,
      html,
      jobId: job.id,
    });

    this.logger.log(
      `Recruiter verification ${isResubmission ? 'resubmission' : 'submission'} confirmation sent for recruiter ${recruiterId} [job: ${job.id}]`
    );
  }

  /**
   * Processes status update notifications to recruiter (NEEDS_CLARIFICATION, APPROVED, REJECTED).
   */
  async handleRecruiterVerificationStatusJob(
    job: JobEnvelope<RecruiterVerificationStatusEmailJobData>
  ): Promise<void> {
    const { recruiterId, status, clarificationMessage, rejectionReason } =
      job.data;
    const retryCount = job.retryCount ?? 0;
    const retryLimit = job.retryLimit ?? 3;
    const queueName =
      job.name ||
      QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_STATUS;

    this.logger.log(
      `Processing recruiter verification status (${status}) for recruiter ${recruiterId} [queue: ${queueName}, job: ${job.id}, attempt: ${retryCount + 1}/${retryLimit + 1}]`
    );

    const recruiter = await this.prisma.recruiter.findUnique({
      where: { id: recruiterId },
      include: {
        user: true,
        company: true,
        verification: true,
      },
    });

    if (!recruiter || !recruiter.user) {
      this.logger.warn(
        `Recruiter ${recruiterId} or associated user not found. Skipping status notification [job: ${job.id}].`
      );
      return;
    }

    if (recruiter.user.is_banned) {
      this.logger.warn(
        `User for recruiter ${recruiterId} is banned. Skipping status notification [job: ${job.id}].`
      );
      return;
    }

    const recipientEmail = recruiter.user.email?.trim();
    if (!recipientEmail || !recipientEmail.includes('@')) {
      this.logger.warn(
        `Invalid recipient email for recruiter ${recruiterId}. Skipping status notification.`
      );
      return;
    }

    const recruiterName =
      `${recruiter.first_name || ''} ${recruiter.last_name || ''}`.trim() ||
      'Recruiter';
    const orgName =
      recruiter.verification?.organization_name ||
      recruiter.company?.name ||
      'your organization';

    const safeRecruiterName = escapeHtml(recruiterName);
    const safeOrgName = escapeHtml(orgName);

    let subject: string;
    let text: string;
    let html: string;
    let idempotencyKey: string;

    if (status === 'NEEDS_CLARIFICATION') {
      const effectiveMessage =
        clarificationMessage?.trim() ||
        recruiter.verification?.clarification_message?.trim() ||
        'Please provide additional details or supporting evidence for your organization.';
      const safeClarification = escapeHtml(effectiveMessage);

      subject = `Action Required: Clarification requested for ${orgName} verification`;
      text = `Hello ${recruiterName},\n\nOur administration team reviewed your organization verification for "${orgName}" and has requested additional clarification:\n\n"${effectiveMessage}"\n\nPlease log in to your CareerForge recruiter portal to update your organization details or upload requested documentation.\n\nBest regards,\nThe CareerForge Team`;
      html = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
           <h2 style="color: #d97706;">Action Required: Clarification Requested</h2>
           <p>Hello ${safeRecruiterName},</p>
           <p>Our administration team reviewed your organization verification for <strong>${safeOrgName}</strong> and requested additional information:</p>
           <blockquote style="border-left: 4px solid #f59e0b; padding-left: 12px; margin: 16px 0; color: #555; background: #fffbeb; padding: 12px;">
             ${safeClarification}
           </blockquote>
           <p>Please log in to your CareerForge recruiter dashboard to update your details or upload supporting proof.</p>
           <p>Best regards,<br/>The CareerForge Team</p>
         </div>`;

      idempotencyKey = job.data.eventId
        ? `email:recruiter-clarification:${job.data.eventId}`
        : `email:recruiter-clarification:${recruiterId}:${recruiter.verification?.clarification_requested_at?.getTime() || recruiter.verification?.updated_at?.getTime() || 'latest'}`;
    } else if (status === 'APPROVED') {
      subject = `Congratulations! ${orgName} has been verified on CareerForge`;
      text = `Hello ${recruiterName},\n\nGreat news! Your recruiter account and organization profile for "${orgName}" have been approved by the CareerForge administration team.\n\nYou now have full access to post job openings, browse qualified candidates, and manage student applications.\n\nBest regards,\nThe CareerForge Team`;
      html = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
           <h2 style="color: #10b981;">Organization Verification Approved!</h2>
           <p>Hello ${safeRecruiterName},</p>
           <p>Great news! Your recruiter account and organization profile for <strong>${safeOrgName}</strong> have been approved by the CareerForge administration team.</p>
           <p>You now have full access to post job openings, search student talent, and review applicant submissions.</p>
           <p>Best regards,<br/>The CareerForge Team</p>
         </div>`;

      idempotencyKey = job.data.eventId
        ? `email:recruiter-approved:${job.data.eventId}`
        : `email:recruiter-approved:${recruiterId}`;
    } else if (status === 'REJECTED') {
      const effectiveReason =
        rejectionReason?.trim() ||
        recruiter.verification?.rejection_reason?.trim() ||
        'Application rejected by administrator';
      const safeReason = escapeHtml(effectiveReason);

      subject = `Update on your organization verification for ${orgName}`;
      text = `Hello ${recruiterName},\n\nThank you for your interest in partnering with CareerForge.\n\nAfter reviewing your submission for "${orgName}", our administration team was unable to approve your recruiter account.\n\nReason: ${effectiveReason}\n\nIf you have questions or believe this decision was made in error, please reach out to our team.\n\nBest regards,\nThe CareerForge Team`;
      html = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
           <h2>Organization Verification Update</h2>
           <p>Hello ${safeRecruiterName},</p>
           <p>Thank you for your interest in partnering with CareerForge.</p>
           <p>After reviewing your submission for <strong>${safeOrgName}</strong>, our administration team was unable to approve your recruiter account at this time.</p>
           <p><strong>Reason:</strong> ${safeReason}</p>
           <p>If you have questions or would like to submit further information, please contact our support team.</p>
           <p>Best regards,<br/>The CareerForge Team</p>
         </div>`;

      idempotencyKey = job.data.eventId
        ? `email:recruiter-rejected:${job.data.eventId}`
        : `email:recruiter-rejected:${recruiterId}`;
    } else {
      this.logger.warn(
        `Unknown recruiter verification status "${status}". Skipping [job: ${job.id}].`
      );
      return;
    }

    await this.dispatchIdempotentEmail({
      idempotencyKey,
      eventType: `recruiter_verification_${status.toLowerCase()}`,
      recipientEmail,
      subject,
      text,
      html,
      jobId: job.id,
    });

    this.logger.log(
      `Recruiter verification status (${status}) email delivered for recruiter ${recruiterId} [job: ${job.id}]`
    );
  }

  /**
   * Processes job moderation status notification to the owning recruiter (ACTIVE or REJECTED).
   */
  async handleJobModerationJob(
    job: JobEnvelope<JobModerationEmailJobData>
  ): Promise<void> {
    const { jobId, status, reason } = job.data;
    const retryCount = job.retryCount ?? 0;
    const retryLimit = job.retryLimit ?? 3;
    const queueName =
      job.name || QUEUE_NAMES.NOTIFICATION_EMAIL_JOB_MODERATION;

    this.logger.log(
      `Processing job moderation notification (${status}) for job ${jobId} [queue: ${queueName}, job: ${job.id}, attempt: ${retryCount + 1}/${retryLimit + 1}]`
    );

    const jobEntity = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        company: true,
        recruiter: {
          include: { user: true },
        },
      },
    });

    if (!jobEntity || !jobEntity.recruiter || !jobEntity.recruiter.user) {
      this.logger.warn(
        `Job ${jobId} or owning recruiter user not found. Skipping moderation notification [job: ${job.id}].`
      );
      return;
    }

    if (jobEntity.recruiter.user.is_banned) {
      this.logger.warn(
        `Owning recruiter user for job ${jobId} is banned. Skipping moderation notification [job: ${job.id}].`
      );
      return;
    }

    const recipientEmail = jobEntity.recruiter.user.email?.trim();
    if (!recipientEmail || !recipientEmail.includes('@')) {
      this.logger.warn(
        `Invalid recipient email for owning recruiter of job ${jobId}. Skipping.`
      );
      return;
    }

    const recruiterName =
      `${jobEntity.recruiter.first_name || ''} ${jobEntity.recruiter.last_name || ''}`.trim() ||
      'Hiring Manager';
    const jobTitle = jobEntity.title;
    const companyName = jobEntity.company?.name || 'your company';

    const safeRecruiterName = escapeHtml(recruiterName);
    const safeJobTitle = escapeHtml(jobTitle);
    const safeCompanyName = escapeHtml(companyName);

    let subject: string;
    let text: string;
    let html: string;
    let idempotencyKey: string;

    if (status === 'ACTIVE') {
      subject = `Job Approved: "${jobTitle}" is now live on CareerForge`;
      text = `Hello ${recruiterName},\n\nYour job posting for "${jobTitle}" at ${companyName} has been approved by our moderation team and is now live.\n\nStudents and candidates can now view and apply for this opportunity. You can manage incoming applications directly from your recruiter dashboard.\n\nBest regards,\nThe CareerForge Team`;
      html = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
           <h2 style="color: #10b981;">Job Posting Approved!</h2>
           <p>Hello ${safeRecruiterName},</p>
           <p>Your job posting for <strong>${safeJobTitle}</strong> at <strong>${safeCompanyName}</strong> has been approved by our moderation team and is now live on the platform.</p>
           <p>Qualified students can now discover and submit applications for this role. You can review candidates in real time from your recruiter dashboard.</p>
           <p>Best regards,<br/>The CareerForge Team</p>
         </div>`;

      idempotencyKey = job.data.eventId
        ? `email:job-mod:${job.data.eventId}`
        : `email:job-mod:${jobId}:ACTIVE`;
    } else if (status === 'REJECTED') {
      const effectiveReason =
        reason?.trim() ||
        'The job posting does not meet our platform posting guidelines.';
      const safeReason = escapeHtml(effectiveReason);

      subject = `Update on your job posting: "${jobTitle}"`;
      text = `Hello ${recruiterName},\n\nOur moderation team has reviewed your job posting for "${jobTitle}" at ${companyName} and determined it cannot be published at this time.\n\nReason: ${effectiveReason}\n\nYou can review and update your job details from your recruiter dashboard to submit for re-evaluation.\n\nBest regards,\nThe CareerForge Team`;
      html = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
           <h2>Job Posting Update</h2>
           <p>Hello ${safeRecruiterName},</p>
           <p>Our moderation team reviewed your job posting for <strong>${safeJobTitle}</strong> at <strong>${safeCompanyName}</strong> and determined it cannot be published at this time.</p>
           <p><strong>Reason:</strong> ${safeReason}</p>
           <p>You can update your job details from your recruiter dashboard and submit for re-evaluation.</p>
           <p>Best regards,<br/>The CareerForge Team</p>
         </div>`;

      idempotencyKey = job.data.eventId
        ? `email:job-mod:${job.data.eventId}`
        : `email:job-mod:${jobId}:REJECTED`;
    } else {
      this.logger.warn(
        `Job status "${status}" does not require an email notification. Skipping [job: ${job.id}].`
      );
      return;
    }

    await this.dispatchIdempotentEmail({
      idempotencyKey,
      eventType: `job_moderation_${status.toLowerCase()}`,
      recipientEmail,
      subject,
      text,
      html,
      jobId: job.id,
    });

    this.logger.log(
      `Job moderation notification (${status}) sent for job ${jobId} [job: ${job.id}]`
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
