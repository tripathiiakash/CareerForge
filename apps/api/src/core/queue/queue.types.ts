export const QUEUE_NAMES = {
  RESUME_TEXT_EXTRACTION: 'resume-text-extraction',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface ResumeTextExtractionJobData {
  resumeId: string;
  studentId: string;
  fileKey: string;
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
