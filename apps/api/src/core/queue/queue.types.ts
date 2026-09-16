import { UserRole } from '@prisma/client';

export const QUEUE_NAMES = {
  RESUME_TEXT_EXTRACTION: 'resume-text-extraction',
  RESUME_AI_ANALYSIS: 'resume-ai-analysis',
  NOTIFICATION_EMAIL_WELCOME: 'notification.email.welcome',
  NOTIFICATION_EMAIL_APPLICATION_SUBMITTED_STUDENT:
    'notification.email.application-submitted-student',
  NOTIFICATION_EMAIL_APPLICATION_SUBMITTED_RECRUITER:
    'notification.email.application-submitted-recruiter',
  NOTIFICATION_EMAIL_APPLICATION_STATUS:
    'notification.email.application-status',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface ResumeTextExtractionJobData {
  resumeId: string;
  studentId: string;
  fileKey: string;
}

export interface ResumeAnalysisJobData {
  resumeId: string;
  studentId: string;
}

export interface WelcomeEmailJobData {
  userId: string;
  email: string;
  role: UserRole;
}

export interface ApplicationSubmittedStudentEmailJobData {
  applicationId: string;
}

export interface ApplicationSubmittedRecruiterEmailJobData {
  applicationId: string;
}

export interface ApplicationStatusEmailJobData {
  applicationId: string;
  status: 'SHORTLISTED' | 'REJECTED';
}

export interface JobEnvelope<T> {
  id: string;
  name: string;
  data: T;
}

export type JobHandler<T> = (job: JobEnvelope<T>) => Promise<void>;

export interface QueueSendOptions {
  singletonKey?: string;
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  expireInSeconds?: number;
}
