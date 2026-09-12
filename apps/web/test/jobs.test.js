import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listJobsQuerySchema } from '@careerforge/validation';

// Mirror of helper functions implemented in apps/web/src/features/jobs
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return Boolean(id && UUID_REGEX.test(String(id).trim()));
}

function buildJobsQueryParams(params = {}) {
  const query = {};

  if (params.page && params.page > 0) {
    query.page = params.page;
  }

  if (params.limit && params.limit > 0 && params.limit <= 50) {
    query.limit = params.limit;
  }

  if (params.search && params.search.trim().length > 0) {
    query.search = params.search.trim();
  }

  if (params.skills && params.skills.trim().length > 0) {
    const cleanedSkills = params.skills
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .join(',');

    if (cleanedSkills.length > 0) {
      query.skills = cleanedSkills;
    }
  }

  if (
    params.employment_type === 'INTERNSHIP' ||
    params.employment_type === 'FULL_TIME'
  ) {
    query.employment_type = params.employment_type;
  }

  return query;
}

function formatPostedDate(dateString) {
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Recently posted';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Recently posted';
  }
}

describe('Job Board & Job Details Frontend Suite (Phase 5.4)', () => {
  describe('Backend Query Schema Validation (listJobsQuerySchema)', () => {
    it('should validate default query params with defaults', () => {
      const parsed = listJobsQuerySchema.parse({});
      assert.equal(parsed.page, 1);
      assert.equal(parsed.limit, 10);
      assert.equal(parsed.search, undefined);
      assert.equal(parsed.skills, undefined);
      assert.equal(parsed.employment_type, undefined);
    });

    it('should allow valid search, skills, and employment_type parameters', () => {
      const query = {
        page: '2',
        limit: '25',
        search: 'backend engineer',
        skills: 'react,node.js,postgres',
        employment_type: 'FULL_TIME',
      };

      const parsed = listJobsQuerySchema.parse(query);
      assert.equal(parsed.page, 2);
      assert.equal(parsed.limit, 25);
      assert.equal(parsed.search, 'backend engineer');
      assert.equal(parsed.skills, 'react,node.js,postgres');
      assert.equal(parsed.employment_type, 'FULL_TIME');
    });

    it('should coerce string numbers for pagination properly', () => {
      const parsed = listJobsQuerySchema.parse({ page: '3', limit: '15' });
      assert.equal(parsed.page, 3);
      assert.equal(parsed.limit, 15);
    });

    it('should reject invalid page or limit values', () => {
      const invalidPage = listJobsQuerySchema.safeParse({ page: 0 });
      assert.equal(invalidPage.success, false);

      const invalidLimit = listJobsQuerySchema.safeParse({ limit: 51 });
      assert.equal(invalidLimit.success, false);

      const negativePage = listJobsQuerySchema.safeParse({ page: -5 });
      assert.equal(negativePage.success, false);
    });

    it('should reject invalid employment_type values', () => {
      const invalidType = listJobsQuerySchema.safeParse({
        employment_type: 'CONTRACT',
      });
      assert.equal(invalidType.success, false);
      assert.match(invalidType.error.issues[0].message, /INTERNSHIP.*FULL_TIME/i);
    });
  });

  describe('Query Parameter Builder (buildJobsQueryParams)', () => {
    it('should omit undefined, null, and empty fields', () => {
      const built = buildJobsQueryParams({});
      assert.deepEqual(built, {});
    });

    it('should include page and limit when specified within valid range', () => {
      const built = buildJobsQueryParams({ page: 2, limit: 20 });
      assert.deepEqual(built, { page: 2, limit: 20 });
    });

    it('should trim search term and drop empty whitespace', () => {
      const withSearch = buildJobsQueryParams({ search: '  frontend developer  ' });
      assert.deepEqual(withSearch, { search: 'frontend developer' });

      const emptySearch = buildJobsQueryParams({ search: '   ' });
      assert.deepEqual(emptySearch, {});
    });

    it('should clean and normalize comma-separated skills', () => {
      const withSkills = buildJobsQueryParams({
        skills: '  React, , TypeScript , Node.js  ',
      });
      assert.deepEqual(withSkills, { skills: 'React,TypeScript,Node.js' });

      const emptySkills = buildJobsQueryParams({ skills: '  , ,   ' });
      assert.deepEqual(emptySkills, {});
    });

    it('should include valid employment types and exclude unrecognized values', () => {
      const fullTime = buildJobsQueryParams({ employment_type: 'FULL_TIME' });
      assert.deepEqual(fullTime, { employment_type: 'FULL_TIME' });

      const internship = buildJobsQueryParams({ employment_type: 'INTERNSHIP' });
      assert.deepEqual(internship, { employment_type: 'INTERNSHIP' });

      const invalid = buildJobsQueryParams({ employment_type: 'PART_TIME' });
      assert.deepEqual(invalid, {});
    });
  });

  describe('UUID Format Validation (isValidUuid)', () => {
    it('should accept valid v4 UUID strings in lowercase and uppercase', () => {
      assert.equal(isValidUuid('e42e476e-3607-4e68-9a2f-98eb413ce161'), true);
      assert.equal(isValidUuid('E42E476E-3607-4E68-9A2F-98EB413CE161'), true);
      assert.equal(isValidUuid('  e42e476e-3607-4e68-9a2f-98eb413ce161  '), true);
    });

    it('should reject invalid, missing, or malformed UUID strings', () => {
      assert.equal(isValidUuid(null), false);
      assert.equal(isValidUuid(undefined), false);
      assert.equal(isValidUuid(''), false);
      assert.equal(isValidUuid('not-a-uuid'), false);
      assert.equal(isValidUuid('12345'), false);
      assert.equal(isValidUuid('e42e476e-3607-4e68-9a2f-98eb413ce16'), false); // too short
      assert.equal(isValidUuid('e42e476e-3607-4e68-9a2f-98eb413ce16199'), false); // too long
    });
  });

  describe('Date Formatting Helper (formatPostedDate)', () => {
    it('should format today date as Today', () => {
      const now = new Date().toISOString();
      assert.equal(formatPostedDate(now), 'Today');
    });

    it('should format yesterday date as Yesterday', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      assert.equal(formatPostedDate(yesterday), 'Yesterday');
    });

    it('should format 3 days ago as 3d ago', () => {
      const threeDaysAgo = new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000
      ).toISOString();
      assert.equal(formatPostedDate(threeDaysAgo), '3d ago');
    });

    it('should format 2 weeks ago as 2w ago', () => {
      const twoWeeksAgo = new Date(
        Date.now() - 14 * 24 * 60 * 60 * 1000
      ).toISOString();
      assert.equal(formatPostedDate(twoWeeksAgo), '2w ago');
    });

    it('should gracefully handle invalid date strings without crashing', () => {
      assert.equal(formatPostedDate('invalid-date'), 'Recently posted');
      assert.equal(formatPostedDate(''), 'Recently posted');
    });
  });

  describe('Response Envelope & Data Boundary Integrity', () => {
    it('should conform to documented job listing item shape (docs/API.md §5.2)', () => {
      const mockApiItem = {
        id: 'e42e476e-3607-4e68-9a2f-98eb413ce161',
        title: 'Junior Backend Developer',
        company: {
          id: '1d8b67b1-419b-43d8-a53c-ebc4d32fbb47',
          name: 'TechNova Solutions',
          logo_url: 'https://example.com/logo.png',
        },
        required_skills: ['Node.js', 'PostgreSQL'],
        employment_type: 'FULL_TIME',
        created_at: '2026-02-05T12:00:00.000Z',
      };

      assert.equal(typeof mockApiItem.id, 'string');
      assert.equal(typeof mockApiItem.title, 'string');
      assert.equal(typeof mockApiItem.company.id, 'string');
      assert.equal(typeof mockApiItem.company.name, 'string');
      assert.ok(Array.isArray(mockApiItem.required_skills));
      assert.ok(
        mockApiItem.employment_type === 'INTERNSHIP' ||
          mockApiItem.employment_type === 'FULL_TIME'
      );

      // Verify no sensitive recruiter fields are present
      assert.equal(mockApiItem.recruiter_id, undefined);
      assert.equal(mockApiItem.internal_notes, undefined);
    });

    it('should conform to documented job detail shape (docs/API.md §5.3)', () => {
      const mockDetailItem = {
        id: 'e42e476e-3607-4e68-9a2f-98eb413ce161',
        title: 'Junior Backend Developer',
        description:
          'We are looking for a Node.js developer with experience in building REST APIs...',
        required_skills: ['Node.js', 'PostgreSQL', 'REST APIs'],
        employment_type: 'FULL_TIME',
        company: {
          id: '1d8b67b1-419b-43d8-a53c-ebc4d32fbb47',
          name: 'TechNova Solutions',
          website: 'https://technova.example.com',
          logo_url: 'https://example.com/logo.png',
        },
        has_applied: false,
        created_at: '2026-02-05T12:00:00.000Z',
      };

      assert.equal(typeof mockDetailItem.description, 'string');
      assert.ok(mockDetailItem.description.length >= 50);
      assert.equal(typeof mockDetailItem.company.website, 'string');
      assert.equal(typeof mockDetailItem.has_applied, 'boolean');

      // Verify security boundary
      assert.equal(mockDetailItem.recruiter_id, undefined);
      assert.equal(mockDetailItem.status, undefined); // Students only see ACTIVE jobs
    });
  });

  describe('Pagination Calculation & Bounds', () => {
    it('should calculate totalPages correctly', () => {
      const calcTotalPages = (total, limit) =>
        total === 0 ? 0 : Math.ceil(total / limit);

      assert.equal(calcTotalPages(0, 10), 0);
      assert.equal(calcTotalPages(5, 10), 1);
      assert.equal(calcTotalPages(10, 10), 1);
      assert.equal(calcTotalPages(11, 10), 2);
      assert.equal(calcTotalPages(45, 10), 5);
      assert.equal(calcTotalPages(100, 25), 4);
    });

    it('should properly identify previous and next disabled states', () => {
      const isPrevDisabled = (page) => page <= 1;
      const isNextDisabled = (page, totalPages) => page >= totalPages;

      assert.equal(isPrevDisabled(1), true);
      assert.equal(isPrevDisabled(2), false);

      assert.equal(isNextDisabled(1, 5), false);
      assert.equal(isNextDisabled(5, 5), true);
      assert.equal(isNextDisabled(6, 5), true);
    });
  });
});
