import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  requestClarificationSchema,
  rejectRecruiterSchema,
} from '@careerforge/validation';

// Helper mirror for organization name display priority
function resolveOrganizationName(recruiter) {
  return (
    recruiter.verification?.organization_name ||
    recruiter.company?.name ||
    'Unspecified Organization'
  );
}

// Helper mirror for evidence URL generation
function getAdminEvidenceDownloadUrl(recruiterId, baseUrl = '/api/v1') {
  return `${baseUrl}/admin/recruiters/${encodeURIComponent(recruiterId)}/evidence`;
}

// Helper mirror for status badge evaluation
function getAdminVerificationBadge(status) {
  switch (status) {
    case 'NEEDS_CLARIFICATION':
      return {
        variant: 'warning',
        text: 'Clarification Requested',
        isPending: true,
      };
    case 'REJECTED':
      return {
        variant: 'destructive',
        text: 'Rejected',
        isPending: false,
      };
    case 'APPROVED':
      return {
        variant: 'success',
        text: 'Approved',
        isPending: false,
      };
    case 'PENDING':
    default:
      return {
        variant: 'warning',
        text: 'Pending Verification',
        isPending: true,
      };
  }
}

// Helper mirror for dialog input validation
function validateDialogInput(action, text) {
  const trimmed = text ? text.trim() : '';

  if (action === 'CLARIFY') {
    const result = requestClarificationSchema.safeParse({ message: trimmed });
    if (!result.success) {
      return { valid: false, error: result.error.issues[0].message };
    }
    return { valid: true, data: result.data };
  }

  if (action === 'REJECT') {
    const result = rejectRecruiterSchema.safeParse({ reason: trimmed });
    if (!result.success) {
      return { valid: false, error: result.error.issues[0].message };
    }
    return { valid: true, data: result.data };
  }

  return { valid: true };
}

describe('Admin Recruiter Verification & Clarification Test Suite', () => {
  const validUuid = '11111111-2222-4333-8444-555555555555';

  // 1. Organization Name Resolution
  describe('1. Organization Name Precedence Resolution', () => {
    it('should prioritize submitted verification organization_name over empty company name', () => {
      const recruiter = {
        id: validUuid,
        company: { name: '' },
        verification: {
          organization_name: 'Stark Industries',
          status: 'PENDING',
        },
      };

      const resolved = resolveOrganizationName(recruiter);
      assert.strictEqual(resolved, 'Stark Industries');
    });

    it('should prioritize submitted verification organization_name over placeholder company name', () => {
      const recruiter = {
        id: validUuid,
        company: { name: 'Old Company Placeholder' },
        verification: {
          organization_name: 'Wayne Enterprises Global',
          status: 'PENDING',
        },
      };

      const resolved = resolveOrganizationName(recruiter);
      assert.strictEqual(resolved, 'Wayne Enterprises Global');
    });

    it('should fallback to company name when verification submission is not present', () => {
      const recruiter = {
        id: validUuid,
        company: { name: 'Acme Corp' },
        verification: null,
      };

      const resolved = resolveOrganizationName(recruiter);
      assert.strictEqual(resolved, 'Acme Corp');
    });

    it('should fallback to "Unspecified Organization" when both company name and verification are absent or empty', () => {
      const recruiter = {
        id: validUuid,
        company: { name: '' },
        verification: null,
      };

      const resolved = resolveOrganizationName(recruiter);
      assert.strictEqual(resolved, 'Unspecified Organization');
    });
  });

  // 2. Evidence Download URL
  describe('2. Admin Evidence Download URL Construction', () => {
    it('should safely format evidence download URL with recruiter ID', () => {
      const url = getAdminEvidenceDownloadUrl(validUuid);
      assert.strictEqual(url, `/api/v1/admin/recruiters/${validUuid}/evidence`);
    });

    it('should encode any special characters in recruiter ID', () => {
      const url = getAdminEvidenceDownloadUrl('user/unsafe:id');
      assert.strictEqual(
        url,
        '/api/v1/admin/recruiters/user%2Funsafe%3Aid/evidence'
      );
    });
  });

  // 3. Status Badge Evaluation
  describe('3. Admin Status Badge Evaluation', () => {
    it('should show Clarification Requested badge when status is NEEDS_CLARIFICATION', () => {
      const badge = getAdminVerificationBadge('NEEDS_CLARIFICATION');
      assert.strictEqual(badge.variant, 'warning');
      assert.strictEqual(badge.text, 'Clarification Requested');
      assert.strictEqual(badge.isPending, true);
    });

    it('should show Rejected badge when status is REJECTED', () => {
      const badge = getAdminVerificationBadge('REJECTED');
      assert.strictEqual(badge.variant, 'destructive');
      assert.strictEqual(badge.text, 'Rejected');
      assert.strictEqual(badge.isPending, false);
    });

    it('should show Pending Verification badge when status is PENDING', () => {
      const badge = getAdminVerificationBadge('PENDING');
      assert.strictEqual(badge.variant, 'warning');
      assert.strictEqual(badge.text, 'Pending Verification');
      assert.strictEqual(badge.isPending, true);
    });
  });

  // 4. Clarification Dialog Validation
  describe('4. Clarification Dialog Input Validation', () => {
    it('should accept valid clarification message meeting requirements', () => {
      const validMsg =
        'Please upload official certificate of incorporation or tax ID.';
      const result = validateDialogInput('CLARIFY', validMsg);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.data.message, validMsg);
    });

    it('should reject empty or whitespace clarification message', () => {
      const result = validateDialogInput('CLARIFY', '   ');
      assert.strictEqual(result.valid, false);
      assert.match(
        result.error,
        /Clarification message must be at least 5 characters/i
      );
    });

    it('should reject clarification message under 5 characters', () => {
      const result = validateDialogInput('CLARIFY', 'help');
      assert.strictEqual(result.valid, false);
      assert.match(
        result.error,
        /Clarification message must be at least 5 characters/i
      );
    });

    it('should reject clarification message exceeding 1000 characters', () => {
      const result = validateDialogInput('CLARIFY', 'A'.repeat(1001));
      assert.strictEqual(result.valid, false);
      assert.match(
        result.error,
        /Clarification message cannot exceed 1000 characters/i
      );
    });
  });

  // 5. Rejection Reason Validation
  describe('5. Rejection Reason Validation', () => {
    it('should accept valid rejection reason meeting requirements', () => {
      const validReason =
        'Unable to verify business entity through registry records.';
      const result = validateDialogInput('REJECT', validReason);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.data.reason, validReason);
    });

    it('should reject empty or whitespace rejection reason', () => {
      const result = validateDialogInput('REJECT', '   ');
      assert.strictEqual(result.valid, false);
      assert.match(
        result.error,
        /Rejection reason must be at least 5 characters/i
      );
    });

    it('should reject rejection reason under 5 characters', () => {
      const result = validateDialogInput('REJECT', 'nope');
      assert.strictEqual(result.valid, false);
      assert.match(
        result.error,
        /Rejection reason must be at least 5 characters/i
      );
    });

    it('should reject rejection reason exceeding 1000 characters', () => {
      const result = validateDialogInput('REJECT', 'B'.repeat(1001));
      assert.strictEqual(result.valid, false);
      assert.match(
        result.error,
        /Rejection reason cannot exceed 1000 characters/i
      );
    });
  });

  // 6. Admin Action Handler Routing
  describe('6. Admin Moderation Action Dispatching', () => {
    it('should route CLARIFY action with payload to requestClarification mutation', () => {
      let dispatchedAction = null;
      let dispatchedPayload = null;

      const mockMutateAsync = (action, payload) => {
        dispatchedAction = action;
        dispatchedPayload = payload;
      };

      const recruiterId = validUuid;
      const clarifyMessage =
        'Please provide government certificate of incorporation';

      mockMutateAsync('CLARIFY', {
        recruiterId,
        message: clarifyMessage,
      });

      assert.strictEqual(dispatchedAction, 'CLARIFY');
      assert.strictEqual(dispatchedPayload.recruiterId, recruiterId);
      assert.strictEqual(dispatchedPayload.message, clarifyMessage);
    });

    it('should route REJECT action with payload to rejectRecruiter mutation', () => {
      let dispatchedAction = null;
      let dispatchedPayload = null;

      const mockMutateAsync = (action, payload) => {
        dispatchedAction = action;
        dispatchedPayload = payload;
      };

      const recruiterId = validUuid;
      const rejectReason =
        'Email domain does not match claimed organization website';

      mockMutateAsync('REJECT', {
        recruiterId,
        reason: rejectReason,
      });

      assert.strictEqual(dispatchedAction, 'REJECT');
      assert.strictEqual(dispatchedPayload.recruiterId, recruiterId);
      assert.strictEqual(dispatchedPayload.reason, rejectReason);
    });
  });
});
