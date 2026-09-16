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
    this.logger.log(
      `Processing welcome email for user ${userId} (${role}) [job: ${job.id}]`
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

    // 3. Dispatch email through provider abstraction
    await this.emailService.sendEmail({
      to: recipientEmail,
      subject,
      text,
      html,
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
    this.logger.log(
      `Processing student application confirmation for application ${applicationId} [job: ${job.id}]`
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

    await this.emailService.sendEmail({
      to: recipientEmail,
      subject,
      text,
      html,
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
    this.logger.log(
      `Processing recruiter applicant alert for application ${applicationId} [job: ${job.id}]`
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

    await this.emailService.sendEmail({
      to: recipientEmail,
      subject,
      text,
      html,
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
    this.logger.log(
      `Processing status update (${status}) for application ${applicationId} [job: ${job.id}]`
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

    await this.emailService.sendEmail({
      to: recipientEmail,
      subject,
      text,
      html,
    });

    this.logger.log(
      `Status update email (${status}) delivered for application ${applicationId} [job: ${job.id}]`
    );
  }
}
