import axios from 'axios';
import { apiClient } from '@/lib/api';
import {
  GetAnalysisData,
  GetAnalysisResponseDto,
  StudentResumeItem,
  StudentResumesResponse,
  TriggerAnalysisData,
  TriggerAnalysisResponseDto,
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
      error:
        'The selected file is empty. Please choose a valid PDF or HTML file.',
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
  const allowedExtensions = ['.pdf', '.html', '.htm'];
  if (!allowedExtensions.includes(extension)) {
    return {
      valid: false,
      error:
        'File must be a valid PDF or HTML document (.pdf, .html, .htm). Other formats are not supported.',
    };
  }

  // If browser identified MIME type, check for format compatibility
  if (file.type) {
    const mime = file.type.toLowerCase().trim();
    if (extension === '.pdf' && mime !== 'application/pdf') {
      return {
        valid: false,
        error:
          'File type does not match PDF. Please ensure the file is an authentic PDF.',
      };
    }
    if (
      (extension === '.html' || extension === '.htm') &&
      mime !== 'text/html' &&
      mime !== 'application/xhtml+xml'
    ) {
      return {
        valid: false,
        error:
          'File type does not match HTML. Please ensure the file is an authentic HTML document.',
      };
    }
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

/**
 * Triggers AI analysis for a specific resume.
 * Adheres to docs/API.md §7.1.
 */
export async function triggerResumeAnalysis(
  resumeId: string
): Promise<TriggerAnalysisData> {
  const response = await apiClient.post<TriggerAnalysisResponseDto>(
    `/resumes/${resumeId}/analyze`
  );
  return response.data.data;
}

/**
 * Retrieves the current AI analysis status and result for a specific resume.
 * Returns null if analysis has never been triggered for this resume (404 NOT_FOUND).
 * Adheres to docs/API.md §7.2.
 */
export async function getResumeAnalysis(
  resumeId: string
): Promise<GetAnalysisData | null> {
  try {
    const response = await apiClient.get<GetAnalysisResponseDto>(
      `/resumes/${resumeId}/analysis`
    );
    return response.data.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Fetches the resume file as a blob along with its response content type.
 */
export async function getResumeFileBlob(
  resumeId: string
): Promise<{ blob: Blob; contentType: string }> {
  const response = await apiClient.get(`/resumes/${resumeId}/file`, {
    responseType: 'blob',
  });
  const rawContentType = response.headers && response.headers['content-type'];
  const contentType =
    typeof rawContentType === 'string'
      ? rawContentType
      : 'application/octet-stream';
  return {
    blob: new Blob([response.data], { type: contentType }),
    contentType,
  };
}

/**
 * Safely views or downloads the resume document:
 * - HTML resumes are NEVER rendered in the browser DOM, iframe, or tab; they are strictly downloaded as safe attachments.
 * - PDF resumes open in a browser tab or download as fallback.
 */
export async function openResumePdf(
  resumeId: string,
  fileName?: string
): Promise<void> {
  const { blob, contentType } = await getResumeFileBlob(resumeId);
  const blobUrl = window.URL.createObjectURL(blob);
  const isHtml =
    fileName?.toLowerCase().endsWith('.html') ||
    fileName?.toLowerCase().endsWith('.htm') ||
    contentType.includes('text/html');

  // Enforce security rule: never render/execute HTML in browser window. Trigger direct attachment download.
  if (isHtml) {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName || 'Resume.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
    return;
  }

  // PDF documents: open in new viewer tab or fallback to direct download
  const newTab = window.open(blobUrl, '_blank');
  if (!newTab) {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName || 'Resume.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
  }
}
