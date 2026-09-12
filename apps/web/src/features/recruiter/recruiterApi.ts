import { apiClient } from '@/lib/api';
import { UpdateRecruiterProfileInput } from '@careerforge/validation';
import { RecruiterProfile, RecruiterProfileResponse } from './types';

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
