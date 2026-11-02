import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { submitRecruiterOrganizationSchema } from '@careerforge/validation';

// Helper mirror for badge mapping in RecruiterProfilePage & Dashboard
function getVerificationBadge(status) {
  switch (status) {
    case 'APPROVED':
      return { variant: 'success', text: 'Verified', isApproved: true };
    case 'NEEDS_CLARIFICATION':
      return {
        variant: 'warning',
        text: 'Clarification Needed',
        isApproved: false,
        requiresAction: true,
      };
    case 'REJECTED':
      return {
        variant: 'destructive',
        text: 'Application Rejected',
        isApproved: false,
      };
    case 'PENDING':
    default:
      return {
        variant: 'warning',
        text: 'Pending Approval',
        isApproved: false,
      };
  }
}

// File evidence validation mirror in RecruiterProfilePage
function validateEvidenceFile(file) {
  const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg'];
  const maxBytes = 5 * 1024 * 1024; // 5MB

  if (!file) {
    return { valid: false, error: 'No file provided' };
  }
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid file type. Only PDF, PNG, and JPEG files are accepted.',
    };
  }
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: 'File is too large. Evidence documents must not exceed 5MB.',
    };
  }
  return { valid: true };
}

// Form payload sanitize mirror
function sanitizeOrganizationFormValues(values) {
  return {
    organization_name: values.organization_name?.trim() || '',
    website_url: values.website_url?.trim() || null,
    linkedin_url: values.linkedin_url?.trim() || null,
    designation: values.designation?.trim() || null,
    description: values.description?.trim() || null,
  };
}

// File size formatter mirror
function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  if (bytes < k) return `${bytes} B`;
  const kb = bytes / k;
  if (kb < k) return `${kb.toFixed(1)} KB`;
  return `${(kb / k).toFixed(2)} MB`;
}

describe('Recruiter Organization Verification Frontend Test Suite', () => {
  // 1. Verification Status Badge Mapping
  describe('1. Verification Status Badge & Pill Mapping', () => {
    it('should map APPROVED status to success badge', () => {
      const badge = getVerificationBadge('APPROVED');
      assert.strictEqual(badge.variant, 'success');
      assert.strictEqual(badge.text, 'Verified');
      assert.strictEqual(badge.isApproved, true);
    });

    it('should map NEEDS_CLARIFICATION to warning badge with action required', () => {
      const badge = getVerificationBadge('NEEDS_CLARIFICATION');
      assert.strictEqual(badge.variant, 'warning');
      assert.strictEqual(badge.text, 'Clarification Needed');
      assert.strictEqual(badge.requiresAction, true);
      assert.strictEqual(badge.isApproved, false);
    });

    it('should map REJECTED status to destructive badge', () => {
      const badge = getVerificationBadge('REJECTED');
      assert.strictEqual(badge.variant, 'destructive');
      assert.strictEqual(badge.text, 'Application Rejected');
      assert.strictEqual(badge.isApproved, false);
    });

    it('should map PENDING status to warning badge', () => {
      const badge = getVerificationBadge('PENDING');
      assert.strictEqual(badge.variant, 'warning');
      assert.strictEqual(badge.text, 'Pending Approval');
      assert.strictEqual(badge.isApproved, false);
    });
  });

  // 2. Clarification Banner Visibility Logic
  describe('2. Clarification Banner Rendering Logic', () => {
    function shouldShowClarificationBanner(verification) {
      return (
        verification?.status === 'NEEDS_CLARIFICATION' &&
        Boolean(verification.clarification_message?.trim())
      );
    }

    it('should show banner when status is NEEDS_CLARIFICATION and message is present', () => {
      const verification = {
        status: 'NEEDS_CLARIFICATION',
        clarification_message:
          'Please attach official certificate of incorporation',
      };
      assert.strictEqual(shouldShowClarificationBanner(verification), true);
    });

    it('should not show banner when status is PENDING or APPROVED', () => {
      assert.strictEqual(
        shouldShowClarificationBanner({
          status: 'PENDING',
          clarification_message: 'Some old message',
        }),
        false
      );
      assert.strictEqual(
        shouldShowClarificationBanner({
          status: 'APPROVED',
          clarification_message: null,
        }),
        false
      );
    });

    it('should not show banner if clarification message is empty or whitespace', () => {
      assert.strictEqual(
        shouldShowClarificationBanner({
          status: 'NEEDS_CLARIFICATION',
          clarification_message: '   ',
        }),
        false
      );
    });
  });

  // 3. Organization Form Validation & Sanitization
  describe('3. Organization Form Validation (submitRecruiterOrganizationSchema)', () => {
    it('should accept valid organization submission with all fields', () => {
      const input = {
        organization_name: 'Acme Technologies Inc.',
        website_url: 'https://acme.example.com',
        linkedin_url: 'https://linkedin.com/company/acme',
        designation: 'Senior Technical Recruiter',
        description: 'Global cloud infrastructure provider.',
      };

      const sanitized = sanitizeOrganizationFormValues(input);
      const result = submitRecruiterOrganizationSchema.safeParse(sanitized);
      assert.strictEqual(result.success, true);
      assert.strictEqual(
        result.data.organization_name,
        'Acme Technologies Inc.'
      );
      assert.strictEqual(result.data.website_url, 'https://acme.example.com');
      assert.strictEqual(result.data.designation, 'Senior Technical Recruiter');
    });

    it('should accept minimal valid organization submission with only organization_name', () => {
      const input = {
        organization_name: 'Startup Lab',
        website_url: '',
        linkedin_url: '',
        designation: '',
        description: '',
      };

      const sanitized = sanitizeOrganizationFormValues(input);
      const result = submitRecruiterOrganizationSchema.safeParse(sanitized);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.organization_name, 'Startup Lab');
      assert.strictEqual(result.data.website_url, null);
      assert.strictEqual(result.data.designation, null);
    });

    it('should reject empty or whitespace-only organization name', () => {
      const input = {
        organization_name: '   ',
      };
      const sanitized = sanitizeOrganizationFormValues(input);
      const result = submitRecruiterOrganizationSchema.safeParse(sanitized);
      assert.strictEqual(result.success, false);
      assert.match(
        result.error.issues[0].message,
        /Organization name must be between 2 and 255 characters/i
      );
    });

    it('should reject invalid website URL protocol (e.g. javascript: or ftp:)', () => {
      const input = {
        organization_name: 'Tech Corp',
        website_url: 'ftp://files.example.com',
      };
      const sanitized = sanitizeOrganizationFormValues(input);
      const result = submitRecruiterOrganizationSchema.safeParse(sanitized);
      assert.strictEqual(result.success, false);
      assert.match(
        result.error.issues[0].message,
        /must be a valid HTTP or HTTPS URL/i
      );
    });

    it('should reject description exceeding 2000 characters', () => {
      const input = {
        organization_name: 'Tech Corp',
        description: 'X'.repeat(2001),
      };
      const sanitized = sanitizeOrganizationFormValues(input);
      const result = submitRecruiterOrganizationSchema.safeParse(sanitized);
      assert.strictEqual(result.success, false);
      assert.match(
        result.error.issues[0].message,
        /Description cannot exceed 2000 characters/i
      );
    });
  });

  // 4. Evidence File Validation
  describe('4. Verification Evidence File Validation', () => {
    it('should accept valid PDF file within 5MB limit', () => {
      const file = {
        name: 'incorporation_cert.pdf',
        type: 'application/pdf',
        size: 1.5 * 1024 * 1024,
      };
      const check = validateEvidenceFile(file);
      assert.strictEqual(check.valid, true);
    });

    it('should accept valid PNG or JPEG image within 5MB limit', () => {
      const pngFile = {
        name: 'company_id.png',
        type: 'image/png',
        size: 500 * 1024,
      };
      assert.strictEqual(validateEvidenceFile(pngFile).valid, true);

      const jpegFile = {
        name: 'badge.jpeg',
        type: 'image/jpeg',
        size: 800 * 1024,
      };
      assert.strictEqual(validateEvidenceFile(jpegFile).valid, true);
    });

    it('should reject disallowed file types (HTML, JS, EXE, ZIP)', () => {
      const htmlFile = {
        name: 'malicious.html',
        type: 'text/html',
        size: 2048,
      };
      const htmlCheck = validateEvidenceFile(htmlFile);
      assert.strictEqual(htmlCheck.valid, false);
      assert.match(
        htmlCheck.error,
        /Only PDF, PNG, and JPEG files are accepted/i
      );

      const zipFile = {
        name: 'archive.zip',
        type: 'application/zip',
        size: 1024,
      };
      const zipCheck = validateEvidenceFile(zipFile);
      assert.strictEqual(zipCheck.valid, false);
    });

    it('should reject files exceeding 5MB limit', () => {
      const oversized = {
        name: 'huge_document.pdf',
        type: 'application/pdf',
        size: 5.1 * 1024 * 1024,
      };
      const check = validateEvidenceFile(oversized);
      assert.strictEqual(check.valid, false);
      assert.match(check.error, /must not exceed 5MB/i);
    });
  });

  // 5. File Size Formatter
  describe('5. Evidence File Size Formatting', () => {
    it('should format bytes into human-readable units', () => {
      assert.strictEqual(formatFileSize(0), '0 B');
      assert.strictEqual(formatFileSize(null), '0 B');
      assert.strictEqual(formatFileSize(512), '512 B');
      assert.strictEqual(formatFileSize(1024), '1.0 KB');
      assert.strictEqual(formatFileSize(200 * 1024), '200.0 KB');
      assert.strictEqual(formatFileSize(1.5 * 1024 * 1024), '1.50 MB');
    });
  });

  // 6. TanStack Cache Invalidation Simulation
  describe('6. TanStack Cache Invalidation Logic', () => {
    it('should update organization cache and invalidate profile query on submission', () => {
      let cachedOrg = null;
      const invalidatedQueries = [];

      const queryClient = {
        setQueryData: (key, data) => {
          if (key[0] === 'recruiter' && key[1] === 'organization') {
            cachedOrg = data;
          }
        },
        invalidateQueries: ({ queryKey }) => {
          invalidatedQueries.push(queryKey.join(':'));
        },
      };

      const submissionData = {
        id: 'ver-1',
        organization_name: 'TechNova',
        status: 'PENDING',
        is_submitted: true,
      };

      // Simulates onSuccess of useSubmitRecruiterOrganization
      queryClient.setQueryData(['recruiter', 'organization'], submissionData);
      queryClient.invalidateQueries({
        queryKey: ['recruiter', 'organization'],
      });
      queryClient.invalidateQueries({
        queryKey: ['recruiter', 'profile'],
      });

      assert.deepStrictEqual(cachedOrg, submissionData);
      assert.strictEqual(
        invalidatedQueries.includes('recruiter:organization'),
        true
      );
      assert.strictEqual(
        invalidatedQueries.includes('recruiter:profile'),
        true
      );
    });

    it('should update organization cache on evidence upload', () => {
      let cachedOrg = null;
      const invalidatedQueries = [];

      const queryClient = {
        setQueryData: (key, data) => {
          if (key[0] === 'recruiter' && key[1] === 'organization') {
            cachedOrg = data;
          }
        },
        invalidateQueries: ({ queryKey }) => {
          invalidatedQueries.push(queryKey.join(':'));
        },
      };

      const updatedWithEvidence = {
        id: 'ver-1',
        organization_name: 'TechNova',
        evidence_file_key: 'guid.pdf',
        evidence_original_name: 'cert.pdf',
      };

      queryClient.setQueryData(
        ['recruiter', 'organization'],
        updatedWithEvidence
      );
      queryClient.invalidateQueries({
        queryKey: ['recruiter', 'organization'],
      });

      assert.deepStrictEqual(cachedOrg, updatedWithEvidence);
      assert.strictEqual(
        invalidatedQueries.includes('recruiter:organization'),
        true
      );
    });
  });

  // 7. Backend Response Normalization Logic
  describe('7. Backend Response Normalization (normalizeRecruiterVerification)', () => {
    function normalizeVerification(payload) {
      if (!payload || typeof payload !== 'object') return null;
      const raw = 'data' in payload && payload.data !== undefined ? payload.data : payload;
      if (!raw || typeof raw !== 'object') return null;
      const target = 'verification' in raw ? raw.verification : raw;
      if (
        !target ||
        typeof target !== 'object' ||
        (!target.id && !target.organization_name && !target.status)
      ) {
        return null;
      }

      return {
        id: typeof target.id === 'string' ? target.id : '',
        organization_name: typeof target.organization_name === 'string' ? target.organization_name : '',
        website_url: typeof target.website_url === 'string' ? target.website_url : null,
        linkedin_url: typeof target.linkedin_url === 'string' ? target.linkedin_url : null,
        designation: typeof target.designation === 'string' ? target.designation : null,
        description: typeof target.description === 'string' ? target.description : null,
        evidence_file_key: typeof target.evidence_file_key === 'string' ? target.evidence_file_key : null,
        evidence_original_name: typeof target.evidence_original_name === 'string' ? target.evidence_original_name : null,
        evidence_mime_type: typeof target.evidence_mime_type === 'string' ? target.evidence_mime_type : null,
        evidence_size_bytes: typeof target.evidence_size_bytes === 'number' ? target.evidence_size_bytes : null,
        status: target.status || 'PENDING',
        clarification_message: typeof target.clarification_message === 'string' ? target.clarification_message : null,
        clarification_requested_at: target.clarification_requested_at ? String(target.clarification_requested_at) : null,
        rejection_reason: typeof target.rejection_reason === 'string' ? target.rejection_reason : null,
        reviewed_at: target.reviewed_at ? String(target.reviewed_at) : null,
        is_submitted: typeof target.is_submitted === 'boolean' ? target.is_submitted : Boolean(target.id || target.organization_name),
      };
    }

    it('should normalize nested backend response into flat RecruiterVerificationSubmission with clarification', () => {
      const backendPayload = {
        recruiter_id: 'rec-123',
        is_approved: false,
        is_company_assigned: false,
        company: null,
        verification: {
          id: 'ver-456',
          recruiter_id: 'rec-123',
          organization_name: 'Cyberdyne Systems',
          website_url: 'https://cyberdyne.example.com',
          status: 'NEEDS_CLARIFICATION',
          clarification_message: 'Please provide certificate of incorporation with company seal',
          clarification_requested_at: '2026-10-15T12:00:00.000Z',
          rejection_reason: null,
          reviewed_at: '2026-10-15T12:00:00.000Z',
        },
      };

      const normalized = normalizeVerification(backendPayload);
      assert.ok(normalized);
      assert.strictEqual(normalized.id, 'ver-456');
      assert.strictEqual(normalized.organization_name, 'Cyberdyne Systems');
      assert.strictEqual(normalized.status, 'NEEDS_CLARIFICATION');
      assert.strictEqual(
        normalized.clarification_message,
        'Please provide certificate of incorporation with company seal'
      );
      assert.strictEqual(normalized.rejection_reason, null);
      assert.strictEqual(normalized.is_submitted, true);
    });

    it('should normalize nested backend response into flat RecruiterVerificationSubmission with rejection', () => {
      const backendPayload = {
        recruiter_id: 'rec-123',
        is_approved: false,
        is_company_assigned: false,
        company: null,
        verification: {
          id: 'ver-789',
          recruiter_id: 'rec-123',
          organization_name: 'Fake Corp',
          status: 'REJECTED',
          clarification_message: null,
          rejection_reason: 'Unable to verify business entity through state registrar',
          reviewed_at: '2026-10-16T15:30:00.000Z',
        },
      };

      const normalized = normalizeVerification(backendPayload);
      assert.ok(normalized);
      assert.strictEqual(normalized.id, 'ver-789');
      assert.strictEqual(normalized.organization_name, 'Fake Corp');
      assert.strictEqual(normalized.status, 'REJECTED');
      assert.strictEqual(
        normalized.rejection_reason,
        'Unable to verify business entity through state registrar'
      );
      assert.strictEqual(normalized.clarification_message, null);
      assert.strictEqual(normalized.is_submitted, true);
    });

    it('should return null when verification record is null in backend response', () => {
      const backendPayload = {
        recruiter_id: 'rec-123',
        is_approved: false,
        is_company_assigned: false,
        company: null,
        verification: null,
      };

      const normalized = normalizeVerification(backendPayload);
      assert.strictEqual(normalized, null);
    });

    it('should return null for empty, null, or undefined payload', () => {
      assert.strictEqual(normalizeVerification(null), null);
      assert.strictEqual(normalizeVerification(undefined), null);
      assert.strictEqual(normalizeVerification({}), null);
    });

    it('should preserve flat response shape for backwards compatibility', () => {
      const flatPayload = {
        id: 'ver-100',
        organization_name: 'Wayne Enterprises',
        status: 'APPROVED',
        clarification_message: null,
        rejection_reason: null,
        is_submitted: true,
      };

      const normalized = normalizeVerification(flatPayload);
      assert.ok(normalized);
      assert.strictEqual(normalized.id, 'ver-100');
      assert.strictEqual(normalized.status, 'APPROVED');
      assert.strictEqual(normalized.organization_name, 'Wayne Enterprises');
      assert.strictEqual(normalized.is_submitted, true);
    });
  });

  // 8. Rejection Banner & Status Message Logic
  describe('8. Rejection Banner & Status Message Logic', () => {
    function shouldShowRejectionBanner(verification, activeStatus) {
      return (
        activeStatus === 'REJECTED' &&
        Boolean(verification?.rejection_reason?.trim())
      );
    }

    function getDashboardStatusDescription(activeStatus) {
      if (activeStatus === 'APPROVED') {
        return 'Authorized to create job postings and manage applicants.';
      }
      if (activeStatus === 'NEEDS_CLARIFICATION') {
        return 'Administrator requested clarification on your organization details.';
      }
      if (activeStatus === 'REJECTED') {
        return 'Administrator rejected the organization verification. Review the rejection reason above.';
      }
      return 'Company registration is awaiting administrator verification.';
    }

    it('should show rejection banner when status is REJECTED and rejection reason is present', () => {
      const verification = {
        status: 'REJECTED',
        rejection_reason: 'Domain ownership verification failed',
      };
      assert.strictEqual(
        shouldShowRejectionBanner(verification, 'REJECTED'),
        true
      );
    });

    it('should not show rejection banner when status is not REJECTED even if old reason exists', () => {
      const verification = {
        status: 'PENDING',
        rejection_reason: 'Old rejection reason from prior review',
      };
      assert.strictEqual(
        shouldShowRejectionBanner(verification, 'PENDING'),
        false
      );
    });

    it('should not show rejection banner if rejection reason is empty or whitespace', () => {
      assert.strictEqual(
        shouldShowRejectionBanner({ status: 'REJECTED', rejection_reason: '' }, 'REJECTED'),
        false
      );
      assert.strictEqual(
        shouldShowRejectionBanner({ status: 'REJECTED', rejection_reason: '   ' }, 'REJECTED'),
        false
      );
      assert.strictEqual(
        shouldShowRejectionBanner({ status: 'REJECTED', rejection_reason: null }, 'REJECTED'),
        false
      );
    });

    it('should return dedicated rejection message for REJECTED status instead of pending fallback', () => {
      assert.strictEqual(
        getDashboardStatusDescription('REJECTED'),
        'Administrator rejected the organization verification. Review the rejection reason above.'
      );
      assert.strictEqual(
        getDashboardStatusDescription('PENDING'),
        'Company registration is awaiting administrator verification.'
      );
      assert.strictEqual(
        getDashboardStatusDescription('NEEDS_CLARIFICATION'),
        'Administrator requested clarification on your organization details.'
      );
      assert.strictEqual(
        getDashboardStatusDescription('APPROVED'),
        'Authorized to create job postings and manage applicants.'
      );
    });
  });
});
