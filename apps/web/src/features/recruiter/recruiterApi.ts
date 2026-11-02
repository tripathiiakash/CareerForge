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
  VerificationStatus,
} from './types';

/**
 * Normalizes backend recruiter organization verification responses into the standard
 * RecruiterVerificationSubmission shape expected by frontend components.
 *
 * Handles:
 * - Nested backend response: `{ recruiter_id, company, is_approved, verification: { ... } }`
 * - Direct/flat verification response: `{ id, organization_name, status, ... }`
 * - Missing or null verification records: returns `null`
 */
export function normalizeRecruiterVerification(
  payload: unknown
): RecruiterVerificationSubmission | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  // Handle wrapped envelope { success: true, data: ... }
  const raw =
    'data' in payload && (payload as { data: unknown }).data !== undefined
      ? (payload as { data: unknown }).data
      : payload;

  if (!raw || typeof raw !== 'object') {
    return null;
  }

  // If payload contains nested `verification` object from backend RecruiterOrganizationData
  const target: Record<string, any> | null =
    'verification' in raw
      ? (raw as { verification: Record<string, any> | null }).verification
      : (raw as Record<string, any>);

  if (
    !target ||
    typeof target !== 'object' ||
    (!target.id && !target.organization_name && !target.status)
  ) {
    return null;
  }

  return {
    id: typeof target.id === 'string' ? target.id : '',
    organization_name:
      typeof target.organization_name === 'string'
        ? target.organization_name
        : '',
    website_url:
      typeof target.website_url === 'string' ? target.website_url : null,
    linkedin_url:
      typeof target.linkedin_url === 'string' ? target.linkedin_url : null,
    designation:
      typeof target.designation === 'string' ? target.designation : null,
    description:
      typeof target.description === 'string' ? target.description : null,
    evidence_file_key:
      typeof target.evidence_file_key === 'string'
        ? target.evidence_file_key
        : null,
    evidence_original_name:
      typeof target.evidence_original_name === 'string'
        ? target.evidence_original_name
        : null,
    evidence_mime_type:
      typeof target.evidence_mime_type === 'string'
        ? target.evidence_mime_type
        : null,
    evidence_size_bytes:
      typeof target.evidence_size_bytes === 'number'
        ? target.evidence_size_bytes
        : null,
    status: (target.status as VerificationStatus) || 'PENDING',
    clarification_message:
      typeof target.clarification_message === 'string'
        ? target.clarification_message
        : null,
    clarification_requested_at: target.clarification_requested_at
      ? String(target.clarification_requested_at)
      : null,
    rejection_reason:
      typeof target.rejection_reason === 'string'
        ? target.rejection_reason
        : null,
    reviewed_at: target.reviewed_at ? String(target.reviewed_at) : null,
    is_submitted:
      typeof target.is_submitted === 'boolean'
        ? target.is_submitted
        : Boolean(target.id || target.organization_name),
  };
}

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
export async function getRecruiterOrganization(): Promise<RecruiterVerificationSubmission | null> {
  const response = await apiClient.get<RecruiterVerificationResponse>(
    '/recruiters/me/organization'
  );
  return normalizeRecruiterVerification(response.data.data);
}

/**
 * Submits or updates the authenticated recruiter's organization details for verification.
 */
export async function submitRecruiterOrganization(
  dto: SubmitRecruiterOrganizationInput
): Promise<RecruiterVerificationSubmission | null> {
  const response = await apiClient.put<RecruiterVerificationResponse>(
    '/recruiters/me/organization',
    dto
  );
  return normalizeRecruiterVerification(response.data.data);
}

/**
 * Uploads verification evidence document (PDF, PNG, JPEG <= 5MB).
 */
export async function uploadRecruiterEvidence(
  file: File
): Promise<RecruiterVerificationSubmission | null> {
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
  return normalizeRecruiterVerification(response.data.data);
}

/**
 * Download URL helper for recruiter's own evidence file.
 */
export function getRecruiterEvidenceDownloadUrl(): string {
  const base = apiClient.defaults.baseURL || '/api/v1';
  return `${base}/recruiters/me/evidence`;
}
