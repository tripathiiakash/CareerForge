const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  submitRecruiterOrganizationSchema,
  requestClarificationSchema,
  rejectRecruiterSchema,
  moderateRecruiterStatusSchema,
} = require('@careerforge/validation');

describe('Recruiter Verification Schemas Test Suite', () => {
  // =========================================================================
  // 1. submitRecruiterOrganizationSchema
  // =========================================================================
  describe('1. submitRecruiterOrganizationSchema', () => {
    it('accepts valid minimal organization submission (name only)', () => {
      const payload = {
        organization_name: 'Stark Industries',
      };
      const result = submitRecruiterOrganizationSchema.parse(payload);
      assert.equal(result.organization_name, 'Stark Industries');
      assert.equal(result.website_url, undefined);
      assert.equal(result.linkedin_url, undefined);
      assert.equal(result.designation, undefined);
      assert.equal(result.description, undefined);
    });

    it('accepts valid full organization submission with URLs and description', () => {
      const payload = {
        organization_name: 'Cyberdyne Systems',
        website_url: 'https://cyberdyne.example.com',
        linkedin_url: 'https://linkedin.com/company/cyberdyne',
        designation: 'Lead Technical Recruiter',
        description:
          'Advanced neural net robotics and autonomous systems research.',
      };
      const result = submitRecruiterOrganizationSchema.parse(payload);
      assert.equal(result.organization_name, 'Cyberdyne Systems');
      assert.equal(result.website_url, 'https://cyberdyne.example.com');
      assert.equal(
        result.linkedin_url,
        'https://linkedin.com/company/cyberdyne'
      );
      assert.equal(result.designation, 'Lead Technical Recruiter');
      assert.equal(
        result.description,
        'Advanced neural net robotics and autonomous systems research.'
      );
    });

    it('trims whitespace and transforms empty optional strings to null', () => {
      const payload = {
        organization_name: '  Wayne Enterprises  ',
        website_url: '  ',
        linkedin_url: '',
        designation: '   ',
        description: '',
      };
      const result = submitRecruiterOrganizationSchema.parse(payload);
      assert.equal(result.organization_name, 'Wayne Enterprises');
      assert.equal(result.website_url, null);
      assert.equal(result.linkedin_url, null);
      assert.equal(result.designation, null);
      assert.equal(result.description, null);
    });

    it('rejects missing or empty organization_name', () => {
      assert.throws(
        () => submitRecruiterOrganizationSchema.parse({}),
        (err) => {
          assert.match(err.message, /Organization name is required/i);
          return true;
        }
      );

      assert.throws(
        () =>
          submitRecruiterOrganizationSchema.parse({ organization_name: '   ' }),
        (err) => {
          assert.match(err.message, /between 2 and 255 characters/i);
          return true;
        }
      );

      assert.throws(
        () =>
          submitRecruiterOrganizationSchema.parse({ organization_name: 'A' }),
        (err) => {
          assert.match(err.message, /between 2 and 255 characters/i);
          return true;
        }
      );
    });

    it('rejects organization_name exceeding 255 characters', () => {
      const longName = 'A'.repeat(256);
      assert.throws(
        () =>
          submitRecruiterOrganizationSchema.parse({
            organization_name: longName,
          }),
        (err) => {
          assert.match(err.message, /cannot exceed 255 characters/i);
          return true;
        }
      );
    });

    it('rejects invalid website_url or linkedin_url', () => {
      assert.throws(
        () =>
          submitRecruiterOrganizationSchema.parse({
            organization_name: 'Acme Corp',
            website_url: 'not-a-valid-url',
          }),
        (err) => {
          assert.match(err.message, /valid HTTP or HTTPS URL/i);
          return true;
        }
      );

      assert.throws(
        () =>
          submitRecruiterOrganizationSchema.parse({
            organization_name: 'Acme Corp',
            linkedin_url: 'ftp://invalidscheme.com',
          }),
        (err) => {
          assert.match(err.message, /valid HTTP or HTTPS URL/i);
          return true;
        }
      );
    });

    it('rejects designation exceeding 100 characters', () => {
      assert.throws(
        () =>
          submitRecruiterOrganizationSchema.parse({
            organization_name: 'Acme Corp',
            designation: 'D'.repeat(101),
          }),
        (err) => {
          assert.match(err.message, /cannot exceed 100 characters/i);
          return true;
        }
      );
    });

    it('rejects description exceeding 2000 characters', () => {
      assert.throws(
        () =>
          submitRecruiterOrganizationSchema.parse({
            organization_name: 'Acme Corp',
            description: 'D'.repeat(2001),
          }),
        (err) => {
          assert.match(err.message, /cannot exceed 2000 characters/i);
          return true;
        }
      );
    });

    it('rejects unrecognized extra fields (strict object check)', () => {
      assert.throws(
        () =>
          submitRecruiterOrganizationSchema.parse({
            organization_name: 'Acme Corp',
            company_id: 'd9b04f14-386d-4952-a5e2-63b71f92e7aa',
          }),
        (err) => {
          assert.match(err.message, /unrecognized_keys/i);
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 2. requestClarificationSchema
  // =========================================================================
  describe('2. requestClarificationSchema', () => {
    it('accepts valid clarification message', () => {
      const payload = {
        message:
          'Please provide an official employment verification letter on company letterhead.',
      };
      const result = requestClarificationSchema.parse(payload);
      assert.equal(result.message, payload.message);
    });

    it('rejects missing or empty message', () => {
      assert.throws(
        () => requestClarificationSchema.parse({}),
        (err) => {
          assert.match(err.message, /Clarification message is required/i);
          return true;
        }
      );

      assert.throws(
        () => requestClarificationSchema.parse({ message: '  ' }),
        (err) => {
          assert.match(err.message, /at least 5 characters/i);
          return true;
        }
      );
    });

    it('rejects message under 5 characters', () => {
      assert.throws(
        () => requestClarificationSchema.parse({ message: 'Plz' }),
        (err) => {
          assert.match(err.message, /at least 5 characters/i);
          return true;
        }
      );
    });

    it('rejects message exceeding 1000 characters', () => {
      assert.throws(
        () => requestClarificationSchema.parse({ message: 'M'.repeat(1001) }),
        (err) => {
          assert.match(err.message, /cannot exceed 1000 characters/i);
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 3. rejectRecruiterSchema
  // =========================================================================
  describe('3. rejectRecruiterSchema', () => {
    it('accepts valid rejection reason', () => {
      const payload = {
        reason:
          'Organization website domain could not be verified and business registry was inactive.',
      };
      const result = rejectRecruiterSchema.parse(payload);
      assert.equal(result.reason, payload.reason);
    });

    it('rejects missing or empty reason', () => {
      assert.throws(
        () => rejectRecruiterSchema.parse({}),
        (err) => {
          assert.match(err.message, /Rejection reason is required/i);
          return true;
        }
      );

      assert.throws(
        () => rejectRecruiterSchema.parse({ reason: '   ' }),
        (err) => {
          assert.match(err.message, /at least 5 characters/i);
          return true;
        }
      );
    });

    it('rejects reason under 5 characters', () => {
      assert.throws(
        () => rejectRecruiterSchema.parse({ reason: 'Bad' }),
        (err) => {
          assert.match(err.message, /at least 5 characters/i);
          return true;
        }
      );
    });

    it('rejects reason exceeding 1000 characters', () => {
      assert.throws(
        () => rejectRecruiterSchema.parse({ reason: 'R'.repeat(1001) }),
        (err) => {
          assert.match(err.message, /cannot exceed 1000 characters/i);
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 4. moderateRecruiterStatusSchema
  // =========================================================================
  describe('4. moderateRecruiterStatusSchema', () => {
    it('accepts status APPROVED without extra fields', () => {
      const parsed = moderateRecruiterStatusSchema.parse({
        status: 'APPROVED',
      });
      assert.equal(parsed.status, 'APPROVED');
    });

    it('accepts status REJECTED without extra fields (backward compatibility)', () => {
      const parsed = moderateRecruiterStatusSchema.parse({
        status: 'REJECTED',
      });
      assert.equal(parsed.status, 'REJECTED');
    });

    it('accepts status NEEDS_CLARIFICATION with optional message', () => {
      const parsed = moderateRecruiterStatusSchema.parse({
        status: 'NEEDS_CLARIFICATION',
        message: 'Please attach proof of business registration',
      });
      assert.equal(parsed.status, 'NEEDS_CLARIFICATION');
      assert.equal(
        parsed.message,
        'Please attach proof of business registration'
      );
    });

    it('accepts is_approved boolean flag', () => {
      const parsedTrue = moderateRecruiterStatusSchema.parse({
        is_approved: true,
      });
      assert.equal(parsedTrue.is_approved, true);

      const parsedFalse = moderateRecruiterStatusSchema.parse({
        is_approved: false,
      });
      assert.equal(parsedFalse.is_approved, false);
    });

    it('rejects empty object without status or is_approved', () => {
      assert.throws(
        () => moderateRecruiterStatusSchema.parse({}),
        (err) => {
          assert.match(err.message, /Either 'status' .* or 'is_approved'/i);
          return true;
        }
      );
    });
  });
});
