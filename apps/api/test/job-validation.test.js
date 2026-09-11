const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createJobSchema } = require('@careerforge/validation');

describe('Job Validation Test Suite (docs/API.md §5.1)', () => {
  const validJobPayload = {
    title: 'Junior Backend Developer',
    description:
      'We are looking for a Node.js developer with experience in building REST APIs and working with PostgreSQL databases...',
    required_skills: ['Node.js', 'PostgreSQL', 'REST APIs'],
    employment_type: 'FULL_TIME',
  };

  it('should accept a valid job posting payload with FULL_TIME', () => {
    const parsed = createJobSchema.parse(validJobPayload);
    assert.equal(parsed.title, 'Junior Backend Developer');
    assert.equal(parsed.employment_type, 'FULL_TIME');
    assert.equal(parsed.required_skills.length, 3);
  });

  it('should accept a valid job posting payload with INTERNSHIP', () => {
    const parsed = createJobSchema.parse({
      ...validJobPayload,
      employment_type: 'INTERNSHIP',
    });
    assert.equal(parsed.employment_type, 'INTERNSHIP');
  });

  it('should trim string fields appropriately', () => {
    const parsed = createJobSchema.parse({
      title: '   Senior React Developer   ',
      description:
        '   ' +
        'We need an experienced frontend developer who knows TypeScript, Next.js, and CSS modules.'.padEnd(
          60,
          '.'
        ) +
        '   ',
      required_skills: ['  React  ', '  TypeScript  '],
      employment_type: 'FULL_TIME',
    });

    assert.equal(parsed.title, 'Senior React Developer');
    assert.equal(parsed.required_skills[0], 'React');
    assert.equal(parsed.required_skills[1], 'TypeScript');
  });

  it('should reject missing required fields', () => {
    assert.throws(
      () => createJobSchema.parse({}),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () =>
        createJobSchema.parse({
          title: 'Developer',
        }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject title shorter than 3 characters or longer than 255 characters', () => {
    assert.throws(
      () =>
        createJobSchema.parse({
          ...validJobPayload,
          title: 'AB',
        }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () =>
        createJobSchema.parse({
          ...validJobPayload,
          title: '   AB   ', // trims to 2
        }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () =>
        createJobSchema.parse({
          ...validJobPayload,
          title: 'A'.repeat(256),
        }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject description shorter than 50 characters or longer than 10,000 characters', () => {
    assert.throws(
      () =>
        createJobSchema.parse({
          ...validJobPayload,
          description: 'Too short description',
        }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () =>
        createJobSchema.parse({
          ...validJobPayload,
          description: 'D'.repeat(10001),
        }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject empty required_skills or exceeding 20 items', () => {
    assert.throws(
      () =>
        createJobSchema.parse({
          ...validJobPayload,
          required_skills: [],
        }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () =>
        createJobSchema.parse({
          ...validJobPayload,
          required_skills: Array.from({ length: 21 }, (_, i) => `Skill ${i}`),
        }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject empty skill strings or skills exceeding 50 characters', () => {
    assert.throws(
      () =>
        createJobSchema.parse({
          ...validJobPayload,
          required_skills: ['   '],
        }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () =>
        createJobSchema.parse({
          ...validJobPayload,
          required_skills: ['S'.repeat(51)],
        }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject invalid employment_type values', () => {
    assert.throws(
      () =>
        createJobSchema.parse({
          ...validJobPayload,
          employment_type: 'PART_TIME',
        }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () =>
        createJobSchema.parse({
          ...validJobPayload,
          employment_type: 'CONTRACT',
        }),
      (err) => err.name === 'ZodError'
    );
  });
});
