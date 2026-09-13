import { apiClient } from '@/lib/api';
import { CreateJobInput, UpdateJobInput } from '@careerforge/validation';
import {
  CreateJobResponse,
  DeleteJobResponse,
  JobCreatedData,
  JobUpdatedData,
  ListRecruiterJobsResponse,
  RecruiterJobItem,
  UpdateJobResponse,
} from './types';
import { JobDetail, JobDetailResponse } from '@/features/jobs/types';

/**
 * Creates a new job posting adhering to docs/API.md §5.1.
 * Role: RECRUITER. Defaults status to PENDING.
 */
export async function createJob(dto: CreateJobInput): Promise<JobCreatedData> {
  const response = await apiClient.post<CreateJobResponse>('/jobs', dto);
  return response.data.data;
}

/**
 * Retrieves job details adhering to docs/API.md §5.3.
 * Owning recruiter can view own job regardless of status.
 */
export async function getJobDetail(jobId: string): Promise<JobDetail> {
  const response = await apiClient.get<JobDetailResponse>(`/jobs/${jobId}`);
  return response.data.data;
}

/**
 * Partially updates an existing job posting adhering to docs/API.md §5.4.
 * Role: RECRUITER. Enforces ownership check.
 */
export async function updateJob(
  jobId: string,
  dto: UpdateJobInput
): Promise<JobUpdatedData> {
  const response = await apiClient.patch<UpdateJobResponse>(
    `/jobs/${jobId}`,
    dto
  );
  return response.data.data;
}

/**
 * Deletes an existing job posting adhering to docs/API.md §5.5.
 * Role: RECRUITER. Enforces ownership check.
 */
export async function deleteJob(jobId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<DeleteJobResponse>(`/jobs/${jobId}`);
  return { message: response.data.message };
}

/**
 * Retrieves all jobs posted by the authenticated recruiter directly from the server.
 * Adheres to docs/API.md §4.3.
 * Role: RECRUITER. Server is the single authoritative source of truth.
 */
export async function getRecruiterJobs(): Promise<RecruiterJobItem[]> {
  const response = await apiClient.get<ListRecruiterJobsResponse>(
    '/recruiters/me/jobs'
  );
  return response.data.data;
}
