const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createJobSchema,
  updateJobSchema,
  listJobsQuerySchema,
} = require('@careerforge/validation');

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

describe('Job Update Validation Test Suite (docs/API.md §5.4)', () => {
  const validUpdatePayload = {
    title: 'Senior Backend Developer',
    description:
      'We are looking for a Senior Node.js developer with experience in microservices and distributed systems.'.padEnd(
        60,
        '.'
      ),
    required_skills: ['Node.js', 'PostgreSQL', 'Docker'],
    employment_type: 'FULL_TIME',
  };

  it('should accept a full valid update payload', () => {
    const parsed = updateJobSchema.parse(validUpdatePayload);
    assert.equal(parsed.title, 'Senior Backend Developer');
    assert.equal(parsed.employment_type, 'FULL_TIME');
    assert.equal(parsed.required_skills.length, 3);
  });

  it('should accept partial updates with single fields', () => {
    // Only title
    const parsedTitle = updateJobSchema.parse({
      title: 'Updated Job Title',
    });
    assert.equal(parsedTitle.title, 'Updated Job Title');
    assert.equal(parsedTitle.description, undefined);

    // Only description
    const parsedDesc = updateJobSchema.parse({
      description:
        'A newly updated description that is sufficiently long to satisfy the 50 character constraint.'.padEnd(
          60,
          '.'
        ),
    });
    assert.ok(parsedDesc.description);

    // Only required_skills
    const parsedSkills = updateJobSchema.parse({
      required_skills: ['TypeScript', 'GraphQL'],
    });
    assert.deepEqual(parsedSkills.required_skills, ['TypeScript', 'GraphQL']);

    // Only employment_type
    const parsedType = updateJobSchema.parse({
      employment_type: 'INTERNSHIP',
    });
    assert.equal(parsedType.employment_type, 'INTERNSHIP');
  });

  it('should trim string values in partial update', () => {
    const parsed = updateJobSchema.parse({
      title: '   Trimmed Title   ',
      required_skills: ['  Python  ', '  Django  '],
    });
    assert.equal(parsed.title, 'Trimmed Title');
    assert.deepEqual(parsed.required_skills, ['Python', 'Django']);
  });

  it('should reject an empty body {}', () => {
    assert.throws(
      () => updateJobSchema.parse({}),
      (err) =>
        err.name === 'ZodError' &&
        err.issues.some((i) =>
          i.message.includes('At least one field must be provided for update')
        )
    );
  });

  it('should reject invalid field values: title length bounds', () => {
    assert.throws(
      () => updateJobSchema.parse({ title: 'AB' }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => updateJobSchema.parse({ title: 'A'.repeat(256) }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject invalid field values: description length bounds', () => {
    assert.throws(
      () => updateJobSchema.parse({ description: 'Too short' }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => updateJobSchema.parse({ description: 'X'.repeat(10001) }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject invalid field values: required_skills bounds and empty items', () => {
    // Empty array
    assert.throws(
      () => updateJobSchema.parse({ required_skills: [] }),
      (err) => err.name === 'ZodError'
    );

    // Over 20 items
    assert.throws(
      () =>
        updateJobSchema.parse({
          required_skills: Array.from({ length: 21 }, (_, i) => `Skill ${i}`),
        }),
      (err) => err.name === 'ZodError'
    );

    // Empty skill item
    assert.throws(
      () => updateJobSchema.parse({ required_skills: ['   '] }),
      (err) => err.name === 'ZodError'
    );

    // Item exceeding 50 chars
    assert.throws(
      () => updateJobSchema.parse({ required_skills: ['A'.repeat(51)] }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject invalid field values: employment_type', () => {
    assert.throws(
      () => updateJobSchema.parse({ employment_type: 'PART_TIME' }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should strictly reject disallowed internal fields (e.g. status, recruiter_id, company_id)', () => {
    // Forbidden status transition attempt
    assert.throws(
      () =>
        updateJobSchema.parse({
          title: 'Valid Title',
          status: 'ACTIVE',
        }),
      (err) => err.name === 'ZodError'
    );

    // Attempt to hijack recruiter ownership
    assert.throws(
      () =>
        updateJobSchema.parse({
          title: 'Valid Title',
          recruiter_id: '55555555-5555-4555-8555-555555555555',
        }),
      (err) => err.name === 'ZodError'
    );

    // Attempt to hijack company ownership
    assert.throws(
      () =>
        updateJobSchema.parse({
          title: 'Valid Title',
          company_id: '66666666-6666-4666-8666-666666666666',
        }),
      (err) => err.name === 'ZodError'
    );

    // Attempt to inject ID or timestamps
    assert.throws(
      () =>
        updateJobSchema.parse({
          id: '11111111-1111-4111-8111-111111111111',
          created_at: new Date(),
        }),
      (err) => err.name === 'ZodError'
    );
  });
});

describe('Job List & Search Query Validation Test Suite (docs/API.md §5.2)', () => {
  it('should supply documented default pagination values when empty query provided', () => {
    const parsed = listJobsQuerySchema.parse({});
    assert.equal(parsed.page, 1);
    assert.equal(parsed.limit, 10);
    assert.equal(parsed.search, undefined);
    assert.equal(parsed.skills, undefined);
    assert.equal(parsed.employment_type, undefined);
  });

  it('should accept valid custom pagination and coerce string parameters', () => {
    const parsed = listJobsQuerySchema.parse({
      page: '3',
      limit: '25',
    });
    assert.equal(parsed.page, 3);
    assert.equal(parsed.limit, 25);
  });

  it('should accept valid search, skills, and employment_type parameters', () => {
    const parsed = listJobsQuerySchema.parse({
      search: 'backend developer',
      skills: 'react,node.js,postgresql',
      employment_type: 'FULL_TIME',
    });
    assert.equal(parsed.search, 'backend developer');
    assert.equal(parsed.skills, 'react,node.js,postgresql');
    assert.equal(parsed.employment_type, 'FULL_TIME');

    const parsedInternship = listJobsQuerySchema.parse({
      employment_type: 'INTERNSHIP',
    });
    assert.equal(parsedInternship.employment_type, 'INTERNSHIP');
  });

  it('should reject invalid page values (< 1, 0, negative, non-numeric)', () => {
    assert.throws(
      () => listJobsQuerySchema.parse({ page: 0 }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => listJobsQuerySchema.parse({ page: -5 }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => listJobsQuerySchema.parse({ page: 'not-a-number' }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => listJobsQuerySchema.parse({ page: 1.5 }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject invalid limit values (< 1, 0, > 50, non-numeric)', () => {
    assert.throws(
      () => listJobsQuerySchema.parse({ limit: 0 }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => listJobsQuerySchema.parse({ limit: 51 }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => listJobsQuerySchema.parse({ limit: 'abc' }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => listJobsQuerySchema.parse({ limit: 10.5 }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject invalid employment_type values', () => {
    assert.throws(
      () => listJobsQuerySchema.parse({ employment_type: 'PART_TIME' }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => listJobsQuerySchema.parse({ employment_type: 'CONTRACT' }),
      (err) => err.name === 'ZodError'
    );
  });
});
