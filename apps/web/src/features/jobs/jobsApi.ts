import { apiClient } from '@/lib/api';
import {
  ApplicationCreatedData,
  ApplyJobResponse,
  JobDetail,
  JobDetailResponse,
  JobFilterParams,
  JobListItem,
  JobsPaginationMeta,
  ListJobsResponse,
  StudentResumeItem,
  StudentResumesResponse,
} from './types';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string | undefined | null): boolean {
  return Boolean(id && UUID_REGEX.test(id.trim()));
}

/**
 * Builds clean query parameters conforming to docs/API.md §5.2.
 * Omits undefined, empty, or unselected values.
 */
export function buildJobsQueryParams(
  params: JobFilterParams = {}
): Record<string, string | number> {
  const query: Record<string, string | number> = {};

  if (params.page && params.page > 0) {
    query.page = params.page;
  }

  if (params.limit && params.limit > 0 && params.limit <= 50) {
    query.limit = params.limit;
  }

  if (params.search && params.search.trim().length > 0) {
    query.search = params.search.trim();
  }

  if (params.skills && params.skills.trim().length > 0) {
    const cleanedSkills = params.skills
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .join(',');

    if (cleanedSkills.length > 0) {
      query.skills = cleanedSkills;
    }
  }

  if (
    params.employment_type === 'INTERNSHIP' ||
    params.employment_type === 'FULL_TIME'
  ) {
    query.employment_type = params.employment_type;
  }

  return query;
}

/**
 * Fetches paginated public active job listings adhering to docs/API.md §5.2.
 */
export async function listJobs(
  params: JobFilterParams = {}
): Promise<{ data: JobListItem[]; meta: JobsPaginationMeta }> {
  const query = buildJobsQueryParams(params);
  const response = await apiClient.get<ListJobsResponse>('/jobs', {
    params: query,
  });

  return {
    data: response.data.data || [],
    meta: response.data.meta || {
      total: 0,
      page: params.page || 1,
      limit: params.limit || 10,
      totalPages: 0,
    },
  };
}

/**
 * Fetches full job details for a specific active job adhering to docs/API.md §5.3.
 */
export async function getJobById(jobId: string): Promise<JobDetail> {
  if (!isValidUuid(jobId)) {
    throw new Error('Invalid job ID format. Must be a valid UUID.');
  }

  const response = await apiClient.get<JobDetailResponse>(
    `/jobs/${encodeURIComponent(jobId)}`
  );
  return response.data.data;
}

/**
 * Submits a job application for the authenticated student adhering to docs/API.md §8.1.
 */
export async function applyToJob(
  jobId: string,
  resumeId: string
): Promise<ApplicationCreatedData> {
  if (!isValidUuid(jobId)) {
    throw new Error('Invalid job ID format. Must be a valid UUID.');
  }
  if (!isValidUuid(resumeId)) {
    throw new Error('Invalid resume ID format. Must be a valid UUID.');
  }

  const response = await apiClient.post<ApplyJobResponse>(
    `/jobs/${encodeURIComponent(jobId)}/apply`,
    { resume_id: resumeId }
  );
  return response.data.data;
}

/**
 * Fetches the authenticated student's uploaded resumes adhering to docs/API.md §6.2.
 */
export async function getStudentResumes(): Promise<StudentResumeItem[]> {
  const response = await apiClient.get<StudentResumesResponse>('/resumes/me');
  return response.data.data || [];
}
