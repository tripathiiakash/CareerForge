import { apiClient } from '@/lib/api';
import { UpdateStudentProfileInput } from '@careerforge/validation';
import { StudentProfile, StudentProfileResponse } from './types';

/**
 * Fetches the authenticated student's profile adhering to docs/API.md §2.1.
 */
export async function getStudentProfile(): Promise<StudentProfile> {
  const response = await apiClient.get<StudentProfileResponse>('/students/me');
  return response.data.data;
}

/**
 * Updates the authenticated student's profile adhering to docs/API.md §2.2.
 */
export async function updateStudentProfile(
  dto: UpdateStudentProfileInput
): Promise<StudentProfile> {
  const response = await apiClient.patch<StudentProfileResponse>(
    '/students/me',
    dto
  );
  return response.data.data;
}
