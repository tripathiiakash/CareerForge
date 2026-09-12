import { apiClient } from '@/lib/api';
import {
  StudentResumeItem,
  StudentResumesResponse,
  UploadResumeData,
  UploadResumeResponse,
  UploadValidationResult,
} from './types';

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Client-side validation matching backend ResumeService requirements (API.md §6.1).
 * - presence
 * - .pdf extension
 * - 5MB maximum file size
 */
export function validateResumeFile(
  file: File | null | undefined
): UploadValidationResult {
  if (!file) {
    return {
      valid: false,
      error: 'Please select a resume file to upload.',
    };
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: 'The selected file is empty. Please choose a valid PDF file.',
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${sizeInMb} MB) exceeds the 5MB limit. Please upload a smaller file.`,
    };
  }

  const fileName = file.name || '';
  const extension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
  if (extension !== '.pdf') {
    return {
      valid: false,
      error:
        'File must be a valid PDF (.pdf extension). Other formats are not supported.',
    };
  }

  // If browser identified MIME type, check for PDF compatibility
  if (file.type && file.type !== 'application/pdf') {
    return {
      valid: false,
      error:
        'File type does not match PDF. Please ensure the file is an authentic PDF.',
    };
  }

  return { valid: true };
}

/**
 * Formats byte counts into human-readable strings.
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Safely extracts a display filename from a file URL or key.
 */
export function getResumeFileName(fileUrl: string): string {
  if (!fileUrl) return 'Resume.pdf';
  try {
    const parsedUrl = new URL(fileUrl, 'http://localhost');
    const pathname = parsedUrl.pathname;
    const parts = pathname.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1];
    return lastPart || 'Resume.pdf';
  } catch {
    const parts = fileUrl.split('/');
    return parts[parts.length - 1] || 'Resume.pdf';
  }
}

/**
 * Formats resume upload dates cleanly.
 */
export function formatResumeDate(dateStr: string): string {
  if (!dateStr) return 'Unknown date';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Invalid date';

    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return 'Unknown date';
  }
}

/**
 * Fetches all resumes uploaded by the authenticated student.
 * Adheres to docs/API.md §6.2.
 */
export async function getStudentResumes(): Promise<StudentResumeItem[]> {
  const response = await apiClient.get<StudentResumesResponse>('/resumes/me');
  return response.data.data;
}

/**
 * Uploads a new resume PDF for the authenticated student.
 * Adheres to docs/API.md §6.1.
 */
export async function uploadStudentResume(
  file: File,
  onUploadProgress?: (percent: number) => void
): Promise<UploadResumeData> {
  const validation = validateResumeFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post<UploadResumeResponse>(
    '/resumes/upload',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onUploadProgress && progressEvent.total) {
          const percent = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onUploadProgress(percent);
        }
      },
    }
  );

  return response.data.data;
}
