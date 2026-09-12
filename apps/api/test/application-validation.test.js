const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  applyJobSchema,
  listStudentApplicationsQuerySchema,
} = require('@careerforge/validation');

describe('Application Validation Test Suite (docs/API.md §8.1)', () => {
  const validPayload = {
    resume_id: '7823f95e-141a-4d43-8ceb-bf6a666245e3',
  };

  it('should accept a valid application payload with a valid UUID resume_id', () => {
    const parsed = applyJobSchema.parse(validPayload);
    assert.equal(parsed.resume_id, validPayload.resume_id);
  });

  it('should reject missing resume_id', () => {
    assert.throws(
      () => applyJobSchema.parse({}),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject non-UUID resume_id values', () => {
    const invalidIds = ['not-a-uuid', '123', '', '7823f95e-141a', null, undefined];
    for (const invalid of invalidIds) {
      assert.throws(
        () => applyJobSchema.parse({ resume_id: invalid }),
        (err) => err.name === 'ZodError'
      );
    }
  });

  it('should strictly reject unexpected or internal properties (strict mode)', () => {
    assert.throws(
      () =>
        applyJobSchema.parse({
          ...validPayload,
          student_id: 'a0f3d611-9a74-4b53-b09e-012b186b51e2',
        }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () =>
        applyJobSchema.parse({
          ...validPayload,
          status: 'SHORTLISTED',
        }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () =>
        applyJobSchema.parse({
          ...validPayload,
          job_id: 'e42e476e-3607-4e68-9a2f-98eb413ce161',
        }),
      (err) => err.name === 'ZodError'
    );
  });
});

describe('Student Application List Query Validation Test Suite (docs/API.md §2.3)', () => {
  it('should supply documented default pagination values when empty query provided', () => {
    const parsed = listStudentApplicationsQuerySchema.parse({});
    assert.equal(parsed.page, 1);
    assert.equal(parsed.limit, 10);
    assert.equal(parsed.status, undefined);
  });

  it('should accept valid custom pagination and status filter', () => {
    const parsed = listStudentApplicationsQuerySchema.parse({
      page: '3',
      limit: '25',
      status: 'SHORTLISTED',
    });
    assert.equal(parsed.page, 3);
    assert.equal(parsed.limit, 25);
    assert.equal(parsed.status, 'SHORTLISTED');

    const appliedParsed = listStudentApplicationsQuerySchema.parse({
      status: 'APPLIED',
    });
    assert.equal(appliedParsed.status, 'APPLIED');

    const rejectedParsed = listStudentApplicationsQuerySchema.parse({
      status: 'REJECTED',
    });
    assert.equal(rejectedParsed.status, 'REJECTED');
  });

  it('should reject invalid page values (< 1, 0, negative, non-numeric)', () => {
    assert.throws(
      () => listStudentApplicationsQuerySchema.parse({ page: 0 }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => listStudentApplicationsQuerySchema.parse({ page: -1 }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => listStudentApplicationsQuerySchema.parse({ page: 'abc' }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => listStudentApplicationsQuerySchema.parse({ page: 1.5 }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject invalid limit values (< 1, 0, > 50, non-numeric)', () => {
    assert.throws(
      () => listStudentApplicationsQuerySchema.parse({ limit: 0 }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => listStudentApplicationsQuerySchema.parse({ limit: 51 }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => listStudentApplicationsQuerySchema.parse({ limit: 'abc' }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => listStudentApplicationsQuerySchema.parse({ limit: 10.5 }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject invalid status values', () => {
    const invalidStatuses = ['PENDING', 'ACTIVE', 'CANCELLED', 'applied', ''];
    for (const invalid of invalidStatuses) {
      assert.throws(
        () => listStudentApplicationsQuerySchema.parse({ status: invalid }),
        (err) => err.name === 'ZodError'
      );
    }
  });
});
