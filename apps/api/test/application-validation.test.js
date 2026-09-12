const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { applyJobSchema } = require('@careerforge/validation');

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
