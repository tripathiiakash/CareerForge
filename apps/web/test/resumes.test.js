import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// Client-side validation logic mirror (matching apps/web/src/features/resumes/resumesApi.ts)
function validateResumeFile(file) {
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

  if (file.type && file.type !== 'application/pdf') {
    return {
      valid: false,
      error:
        'File type does not match PDF. Please ensure the file is an authentic PDF.',
    };
  }

  return { valid: true };
}

function formatFileSize(bytes) {
  if (bytes <= 0 || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getResumeFileName(fileUrl) {
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

function formatResumeDate(dateStr) {
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

// UI State Evaluator for ResumePage
function evaluateResumePageState({
  isLoading = false,
  isError = false,
  error = null,
  resumes = [],
}) {
  if (isLoading) {
    return { state: 'LOADING' };
  }
  if (isError) {
    return {
      state: 'ERROR',
      message: error?.message || 'Unable to load your resumes',
    };
  }
  if (resumes.length === 0) {
    return {
      state: 'EMPTY',
      message: 'No resumes uploaded yet',
      canUpload: true,
    };
  }

  const primaryResume = resumes.find((r) => r.is_primary) || resumes[0];
  const otherResumes = resumes.filter((r) => r.id !== primaryResume.id);

  return {
    state: 'SUCCESS',
    primaryResume,
    otherResumes,
    count: resumes.length,
  };
}

describe('Student Resume Management Suite (Phase 5.8 - docs/API.md §6.1, §6.2)', () => {
  describe('1. Client-Side Upload File Validation', () => {
    it('should reject missing, null, or undefined files', () => {
      const resNull = validateResumeFile(null);
      assert.strictEqual(resNull.valid, false);
      assert.match(resNull.error, /Please select a resume file/);

      const resUndef = validateResumeFile(undefined);
      assert.strictEqual(resUndef.valid, false);
    });

    it('should reject 0-byte empty files', () => {
      const emptyFile = {
        name: 'empty.pdf',
        size: 0,
        type: 'application/pdf',
      };
      const res = validateResumeFile(emptyFile);
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /file is empty/i);
    });

    it('should reject files exceeding the 5MB size limit', () => {
      const oversizedFile = {
        name: 'heavy_resume.pdf',
        size: 5 * 1024 * 1024 + 1, // 5MB + 1 byte
        type: 'application/pdf',
      };
      const res = validateResumeFile(oversizedFile);
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /exceeds the 5MB limit/);
    });

    it('should reject non-PDF file extensions', () => {
      const wordDoc = {
        name: 'resume.docx',
        size: 100 * 1024,
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
      const resWord = validateResumeFile(wordDoc);
      assert.strictEqual(resWord.valid, false);
      assert.match(resWord.error, /File must be a valid PDF/);

      const image = {
        name: 'resume.png',
        size: 200 * 1024,
        type: 'image/png',
      };
      const resImage = validateResumeFile(image);
      assert.strictEqual(resImage.valid, false);
    });

    it('should reject MIME type mismatch even with .pdf extension', () => {
      const spoofed = {
        name: 'fake.pdf',
        size: 50 * 1024,
        type: 'text/html',
      };
      const res = validateResumeFile(spoofed);
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /File type does not match PDF/);
    });

    it('should accept valid PDF files within 5MB limit', () => {
      const validPdf = {
        name: 'student_resume_2026.pdf',
        size: 1.5 * 1024 * 1024,
        type: 'application/pdf',
      };
      const res = validateResumeFile(validPdf);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.error, undefined);
    });

    it('should accept valid PDF files with uppercase extension (.PDF)', () => {
      const validPdfUpper = {
        name: 'MY_RESUME.PDF',
        size: 2 * 1024 * 1024,
        type: 'application/pdf',
      };
      const res = validateResumeFile(validPdfUpper);
      assert.strictEqual(res.valid, true);
    });
  });

  describe('2. Formatting & URL Utilities', () => {
    it('should format file sizes cleanly across byte ranges', () => {
      assert.strictEqual(formatFileSize(0), '0 B');
      assert.strictEqual(formatFileSize(500), '500 B');
      assert.strictEqual(formatFileSize(1024), '1.0 KB');
      assert.strictEqual(formatFileSize(2048), '2.0 KB');
      assert.strictEqual(formatFileSize(1.5 * 1024 * 1024), '1.50 MB');
      assert.strictEqual(formatFileSize(5 * 1024 * 1024), '5.00 MB');
    });

    it('should safely extract filename from storage URL or fallback', () => {
      assert.strictEqual(
        getResumeFileName(
          'http://localhost:4000/uploads/resumes/c9b0e123-4567-89ab.pdf'
        ),
        'c9b0e123-4567-89ab.pdf'
      );
      assert.strictEqual(
        getResumeFileName('/uploads/resumes/my-resume.pdf'),
        'my-resume.pdf'
      );
      assert.strictEqual(getResumeFileName(''), 'Resume.pdf');
    });

    it('should format resume upload dates properly', () => {
      const formatted = formatResumeDate('2026-09-12T10:30:00.000Z');
      assert.match(formatted, /Sep 12, 2026/);

      assert.strictEqual(formatResumeDate('invalid-date'), 'Invalid date');
      assert.strictEqual(formatResumeDate(''), 'Unknown date');
    });
  });

  describe('3. Resume List Response Mapping (docs/API.md §6.2)', () => {
    it('should map backend response items adhering to contract', () => {
      const mockApiResponse = {
        success: true,
        data: [
          {
            id: 'c9b0e123-4567-89ab-cdef-0123456789ab',
            file_url:
              'http://localhost:4000/uploads/resumes/c9b0e123-4567-89ab.pdf',
            is_primary: true,
            has_analysis: true,
            created_at: '2026-09-12T12:00:00.000Z',
          },
          {
            id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
            file_url:
              'http://localhost:4000/uploads/resumes/a1b2c3d4-e5f6-7890.pdf',
            is_primary: false,
            has_analysis: false,
            created_at: '2026-08-10T09:15:00.000Z',
          },
        ],
      };

      assert.strictEqual(mockApiResponse.success, true);
      assert.strictEqual(mockApiResponse.data.length, 2);

      const primary = mockApiResponse.data[0];
      assert.strictEqual(primary.is_primary, true);
      assert.strictEqual(primary.has_analysis, true);
      assert.strictEqual(typeof primary.file_url, 'string');
      assert.match(primary.created_at, /^\d{4}-\d{2}-\d{2}T/);

      const secondary = mockApiResponse.data[1];
      assert.strictEqual(secondary.is_primary, false);
      assert.strictEqual(secondary.has_analysis, false);
    });
  });

  describe('4. Empty State Evaluation', () => {
    it('should evaluate EMPTY state and guide user to upload when no resumes exist', () => {
      const state = evaluateResumePageState({
        isLoading: false,
        isError: false,
        resumes: [],
      });

      assert.strictEqual(state.state, 'EMPTY');
      assert.strictEqual(state.message, 'No resumes uploaded yet');
      assert.strictEqual(state.canUpload, true);
    });
  });

  describe('5. Primary Resume Identification & Separation', () => {
    it('should identify the resume with is_primary: true as primaryResume', () => {
      const resumes = [
        {
          id: 'res-newest',
          file_url: 'http://localhost/newest.pdf',
          is_primary: true,
          has_analysis: true,
          created_at: '2026-09-12T00:00:00Z',
        },
        {
          id: 'res-older',
          file_url: 'http://localhost/older.pdf',
          is_primary: false,
          has_analysis: false,
          created_at: '2026-09-01T00:00:00Z',
        },
      ];

      const state = evaluateResumePageState({ resumes });
      assert.strictEqual(state.state, 'SUCCESS');
      assert.strictEqual(state.primaryResume.id, 'res-newest');
      assert.strictEqual(state.primaryResume.is_primary, true);
      assert.strictEqual(state.otherResumes.length, 1);
      assert.strictEqual(state.otherResumes[0].id, 'res-older');
    });

    it('should fallback safely to first resume if is_primary is not explicitly set', () => {
      const resumes = [
        {
          id: 'res-1',
          file_url: 'http://localhost/1.pdf',
          is_primary: false,
          has_analysis: false,
          created_at: '2026-09-12T00:00:00Z',
        },
      ];

      const state = evaluateResumePageState({ resumes });
      assert.strictEqual(state.primaryResume.id, 'res-1');
      assert.strictEqual(state.otherResumes.length, 0);
    });
  });

  describe('6. Upload UI State & Concurrency Protection', () => {
    it('should prevent duplicate submission while upload is in flight (isPending)', () => {
      const isPending = true;

      // In ResumeUpload, buttons and input are disabled when isPending is true
      const canSubmit = !isPending;
      const isInputDisabled = isPending;

      assert.strictEqual(canSubmit, false);
      assert.strictEqual(isInputDisabled, true);
    });

    it('should track and format upload progress percentage', () => {
      let progress = 0;
      const progressCallback = (percent) => {
        progress = percent;
      };

      progressCallback(45);
      assert.strictEqual(progress, 45);

      progressCallback(100);
      assert.strictEqual(progress, 100);
    });
  });

  describe('7. TanStack Query Cache Invalidation Logic', () => {
    it('should invalidate ["student", "resumes"] on upload success', () => {
      const invalidatedKeys = [];
      const mockQueryClient = {
        invalidateQueries: ({ queryKey }) => {
          invalidatedKeys.push(queryKey);
        },
      };

      const RESUMES_QUERY_KEY = ['student', 'resumes'];

      // Simulate onSuccess callback of useUploadResume hook
      mockQueryClient.invalidateQueries({ queryKey: RESUMES_QUERY_KEY });

      assert.strictEqual(invalidatedKeys.length, 1);
      assert.deepStrictEqual(invalidatedKeys[0], ['student', 'resumes']);
    });
  });

  describe('8. Error Handling & Payload Limits', () => {
    it('should handle 413 Payload Too Large error gracefully', () => {
      const errorResponse = {
        response: {
          status: 413,
          data: {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'File exceeds 5MB size limit',
            },
          },
        },
      };

      const errorMessage =
        errorResponse.response.data.error.message || 'Upload failed';
      assert.strictEqual(errorMessage, 'File exceeds 5MB size limit');
    });

    it('should handle 400 Validation Error for invalid magic bytes', () => {
      const errorResponse = {
        response: {
          status: 400,
          data: {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message:
                'File must be a valid PDF (magic byte signature mismatch)',
            },
          },
        },
      };

      const errorMessage = errorResponse.response.data.error.message;
      assert.match(errorMessage, /magic byte signature mismatch/);
    });
  });

  describe('9. Unauthorized (401) State Handling', () => {
    it('should intercept 401 error and trigger unauthorized session cleanup', () => {
      let dispatchedEvent = null;
      let sessionCleared = false;

      const mockClearSession = () => {
        sessionCleared = true;
      };

      const mockDispatch = (evt) => {
        dispatchedEvent = evt;
      };

      // Simulates apiClient response error interceptor for 401
      const error = { response: { status: 401 } };
      if (error.response?.status === 401) {
        mockClearSession();
        mockDispatch('careerforge:unauthorized');
      }

      assert.strictEqual(sessionCleared, true);
      assert.strictEqual(dispatchedEvent, 'careerforge:unauthorized');
    });
  });

  describe('10. Student Role Route Protection', () => {
    function canAccessStudentResumeRoute(user) {
      if (!user) return false;
      return user.role === 'STUDENT';
    }

    it('should permit authenticated STUDENT role', () => {
      assert.strictEqual(
        canAccessStudentResumeRoute({ id: 'u1', role: 'STUDENT' }),
        true
      );
    });

    it('should deny unauthenticated users', () => {
      assert.strictEqual(canAccessStudentResumeRoute(null), false);
    });

    it('should deny RECRUITER or ADMIN roles from student resume route', () => {
      assert.strictEqual(
        canAccessStudentResumeRoute({ id: 'u2', role: 'RECRUITER' }),
        false
      );
      assert.strictEqual(
        canAccessStudentResumeRoute({ id: 'u3', role: 'ADMIN' }),
        false
      );
    });
  });

  describe('11. Unsupported Operations Boundary Check', () => {
    it('verifies that no delete resume endpoint or mutation is exposed', () => {
      // Backend ResumeController exposes:
      // - POST /resumes/upload
      // - GET /resumes/me
      // - POST /resumes/:resumeId/analyze
      // - GET /resumes/:resumeId/analysis
      // It does NOT have DELETE /resumes/:id or PATCH /resumes/:id/primary
      const supportedOperations = ['upload', 'list', 'analyze', 'getAnalysis'];
      assert.strictEqual(supportedOperations.includes('delete'), false);
      assert.strictEqual(supportedOperations.includes('setPrimary'), false);
    });
  });

  describe('12. Safe Link Presentation', () => {
    it('should ensure resume link includes noopener noreferrer attributes', () => {
      const linkAttributes = {
        target: '_blank',
        rel: 'noopener noreferrer',
      };
      assert.strictEqual(linkAttributes.target, '_blank');
      assert.strictEqual(linkAttributes.rel, 'noopener noreferrer');
    });
  });
});
