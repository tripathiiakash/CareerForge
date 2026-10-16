import { apiClient } from '@/lib/api';
import {
  UpdateRecruiterProfileInput,
  SubmitRecruiterOrganizationInput,
} from '@careerforge/validation';
import {
  RecruiterProfile,
  RecruiterProfileResponse,
  RecruiterVerificationSubmission,
  RecruiterVerificationResponse,
} from './types';

/**
 * Fetches the authenticated recruiter's profile adhering to docs/API.md §4.1.
 */
export async function getRecruiterProfile(): Promise<RecruiterProfile> {
  const response =
    await apiClient.get<RecruiterProfileResponse>('/recruiters/me');
  return response.data.data;
}

/**
 * Updates the authenticated recruiter's profile adhering to docs/API.md §4.2.
 */
export async function updateRecruiterProfile(
  dto: UpdateRecruiterProfileInput
): Promise<RecruiterProfile> {
  const response = await apiClient.patch<RecruiterProfileResponse>(
    '/recruiters/me',
    dto
  );
  return response.data.data;
}

/**
 * Fetches the authenticated recruiter's organization verification submission.
 */
export async function getRecruiterOrganization(): Promise<RecruiterVerificationSubmission> {
  const response = await apiClient.get<RecruiterVerificationResponse>(
    '/recruiters/me/organization'
  );
  return response.data.data;
}

/**
 * Submits or updates the authenticated recruiter's organization details for verification.
 */
export async function submitRecruiterOrganization(
  dto: SubmitRecruiterOrganizationInput
): Promise<RecruiterVerificationSubmission> {
  const response = await apiClient.put<RecruiterVerificationResponse>(
    '/recruiters/me/organization',
    dto
  );
  return response.data.data;
}

/**
 * Uploads verification evidence document (PDF, PNG, JPEG <= 5MB).
 */
export async function uploadRecruiterEvidence(
  file: File
): Promise<RecruiterVerificationSubmission> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post<RecruiterVerificationResponse>(
    '/recruiters/me/evidence',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data.data;
}

/**
 * Download URL helper for recruiter's own evidence file.
 */
export function getRecruiterEvidenceDownloadUrl(): string {
  const base = apiClient.defaults.baseURL || '/api/v1';
  return `${base}/recruiters/me/evidence`;
}
