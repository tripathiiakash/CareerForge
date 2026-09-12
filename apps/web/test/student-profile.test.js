import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { updateStudentProfileSchema } from '@careerforge/validation';

// Helper mirror of profile completeness logic in StudentDashboardPage
function calculateProfileCompleteness(profile) {
  if (!profile) return 0;
  const fields = [
    Boolean(profile.first_name && profile.first_name.trim().length > 0),
    Boolean(profile.last_name && profile.last_name.trim().length > 0),
    Boolean(profile.university && profile.university.trim().length > 0),
    Boolean(profile.degree && profile.degree.trim().length > 0),
    Boolean(profile.graduation_year && profile.graduation_year >= 2000),
    Boolean(profile.skills && profile.skills.length > 0),
    Boolean(profile.github_url && profile.github_url.trim().length > 0),
    Boolean(profile.linkedin_url && profile.linkedin_url.trim().length > 0),
  ];

  const completed = fields.filter(Boolean).length;
  return Math.round((completed / fields.length) * 100);
}

// Form values sanitizer mirror used in StudentProfilePage
function sanitizeProfileFormValues(values) {
  const skillsArray = (values.skills || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return {
    first_name: values.first_name?.trim(),
    last_name: values.last_name?.trim(),
    university: values.university?.trim() || null,
    degree: values.degree?.trim() || null,
    graduation_year: values.graduation_year ? Number(values.graduation_year) : null,
    skills: skillsArray.length > 0 ? skillsArray : undefined,
    github_url: values.github_url?.trim() || null,
    linkedin_url: values.linkedin_url?.trim() || null,
  };
}

describe('Student Profile & Dashboard Suite (Phase 5.3)', () => {
  describe('Profile Schema Validation (updateStudentProfileSchema)', () => {
    it('should validate a complete valid student profile payload', () => {
      const validPayload = {
        first_name: 'Rahul',
        last_name: 'Sharma',
        university: 'State Technical University',
        graduation_year: 2025,
        degree: 'B.Tech Computer Science',
        skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
        github_url: 'https://github.com/rahul123',
        linkedin_url: 'https://linkedin.com/in/rahul123',
      };

      const result = updateStudentProfileSchema.safeParse(validPayload);
      assert.equal(result.success, true);
    });

    it('should allow partial profile update payload', () => {
      const partialPayload = {
        university: 'New Institute of Technology',
        graduation_year: 2026,
      };

      const result = updateStudentProfileSchema.safeParse(partialPayload);
      assert.equal(result.success, true);
    });

    it('should allow nullable fields to be explicitly null', () => {
      const nullablePayload = {
        university: null,
        degree: null,
        graduation_year: null,
        github_url: null,
        linkedin_url: null,
      };

      const result = updateStudentProfileSchema.safeParse(nullablePayload);
      assert.equal(result.success, true);
    });

    it('should reject graduation year before 2000 or after 2035', () => {
      const tooEarly = updateStudentProfileSchema.safeParse({ graduation_year: 1999 });
      assert.equal(tooEarly.success, false);
      assert.match(tooEarly.error.issues[0].message, /between 2000 and 2035/i);

      const tooLate = updateStudentProfileSchema.safeParse({ graduation_year: 2036 });
      assert.equal(tooLate.success, false);
      assert.match(tooLate.error.issues[0].message, /between 2000 and 2035/i);
    });

    it('should reject invalid URL format for github_url and linkedin_url', () => {
      const invalidGithub = updateStudentProfileSchema.safeParse({ github_url: 'not-a-valid-url' });
      assert.equal(invalidGithub.success, false);
      assert.match(invalidGithub.error.issues[0].message, /valid URL format/i);

      const invalidLinkedin = updateStudentProfileSchema.safeParse({ linkedin_url: 'just-text' });
      assert.equal(invalidLinkedin.success, false);
      assert.match(invalidLinkedin.error.issues[0].message, /valid URL format/i);
    });

    it('should lowercase and deduplicate skills automatically via schema transform', () => {
      const payload = {
        skills: ['React', 'REACT', 'react', 'TypeScript', 'Node.JS'],
      };

      const result = updateStudentProfileSchema.safeParse(payload);
      assert.equal(result.success, true);
      if (result.success) {
        assert.deepEqual(result.data.skills, ['react', 'typescript', 'node.js']);
      }
    });

    it('should reject skills exceeding 30 items', () => {
      const tooManySkills = Array.from({ length: 31 }, (_, i) => `skill-${i}`);
      const result = updateStudentProfileSchema.safeParse({ skills: tooManySkills });
      assert.equal(result.success, false);
      assert.match(result.error.issues[0].message, /30 items/i);
    });

    it('should reject first_name and last_name exceeding 100 characters', () => {
      const longName = 'A'.repeat(101);
      const resultFirst = updateStudentProfileSchema.safeParse({ first_name: longName });
      assert.equal(resultFirst.success, false);

      const resultLast = updateStudentProfileSchema.safeParse({ last_name: longName });
      assert.equal(resultLast.success, false);
    });
  });

  describe('Profile Completeness Calculation', () => {
    it('should return 0% for empty or null profile', () => {
      assert.equal(calculateProfileCompleteness(null), 0);
      assert.equal(calculateProfileCompleteness(undefined), 0);
      assert.equal(
        calculateProfileCompleteness({
          first_name: '',
          last_name: '',
          university: null,
          degree: null,
          graduation_year: null,
          skills: [],
          github_url: null,
          linkedin_url: null,
        }),
        0,
      );
    });

    it('should calculate 50% for profile with 4 of 8 fields filled', () => {
      const halfProfile = {
        first_name: 'Akash',
        last_name: 'Tripathi',
        university: 'State University',
        degree: 'B.Tech',
        graduation_year: null,
        skills: [],
        github_url: null,
        linkedin_url: null,
      };
      assert.equal(calculateProfileCompleteness(halfProfile), 50);
    });

    it('should calculate 100% when all 8 fields are filled', () => {
      const fullProfile = {
        first_name: 'Rahul',
        last_name: 'Sharma',
        university: 'State University',
        degree: 'Computer Science',
        graduation_year: 2025,
        skills: ['react', 'node'],
        github_url: 'https://github.com/rahul',
        linkedin_url: 'https://linkedin.com/in/rahul',
      };
      assert.equal(calculateProfileCompleteness(fullProfile), 100);
    });
  });

  describe('Form Input Data Sanitization', () => {
    it('should sanitize empty string inputs to null for nullable fields', () => {
      const formInput = {
        first_name: 'Jane',
        last_name: 'Doe',
        university: '   ',
        degree: '',
        graduation_year: '',
        skills: '',
        github_url: '   ',
        linkedin_url: '',
      };

      const sanitized = sanitizeProfileFormValues(formInput);

      assert.equal(sanitized.first_name, 'Jane');
      assert.equal(sanitized.last_name, 'Doe');
      assert.equal(sanitized.university, null);
      assert.equal(sanitized.degree, null);
      assert.equal(sanitized.graduation_year, null);
      assert.equal(sanitized.skills, undefined);
      assert.equal(sanitized.github_url, null);
      assert.equal(sanitized.linkedin_url, null);
    });

    it('should parse comma-separated skills into clean trimmed array', () => {
      const formInput = {
        first_name: 'Jane',
        last_name: 'Doe',
        skills: '  React, TypeScript  , Node.js , , Docker  ',
      };

      const sanitized = sanitizeProfileFormValues(formInput);
      assert.deepEqual(sanitized.skills, ['react', 'typescript', 'node.js', 'docker']);
    });
  });
});
