const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createCompanySchema } = require('@careerforge/validation');

describe('Company Validation Test Suite (docs/API.md §3.1)', () => {
  it('should accept valid company creation payload with required name only', () => {
    const payload = {
      name: 'Acme Corporation',
    };

    const parsed = createCompanySchema.parse(payload);
    assert.equal(parsed.name, 'Acme Corporation');
    assert.equal(parsed.website, undefined);
    assert.equal(parsed.logo_url, undefined);
  });

  it('should accept valid company creation payload with all fields', () => {
    const payload = {
      name: 'TechNova Solutions',
      website: 'https://technova.example.com',
      logo_url: 'https://s3.amazonaws.com/bucket/logo.png',
    };

    const parsed = createCompanySchema.parse(payload);
    assert.equal(parsed.name, 'TechNova Solutions');
    assert.equal(parsed.website, 'https://technova.example.com');
    assert.equal(parsed.logo_url, 'https://s3.amazonaws.com/bucket/logo.png');
  });

  it('should trim string fields appropriately', () => {
    const payload = {
      name: '   Initech Inc   ',
      website: '  https://initech.example.com  ',
      logo_url: '  https://cdn.initech.com/logo.svg  ',
    };

    const parsed = createCompanySchema.parse(payload);
    assert.equal(parsed.name, 'Initech Inc');
    assert.equal(parsed.website, 'https://initech.example.com');
    assert.equal(parsed.logo_url, 'https://cdn.initech.com/logo.svg');
  });

  it('should accept nullable website and logo_url fields', () => {
    const payload = {
      name: 'Hooli Systems',
      website: null,
      logo_url: null,
    };

    const parsed = createCompanySchema.parse(payload);
    assert.equal(parsed.name, 'Hooli Systems');
    assert.equal(parsed.website, null);
    assert.equal(parsed.logo_url, null);
  });

  it('should accept boundary lengths for name (2 chars and 255 chars)', () => {
    const minName = 'AB';
    const parsedMin = createCompanySchema.parse({ name: minName });
    assert.equal(parsedMin.name, 'AB');

    const maxName = 'X'.repeat(255);
    const parsedMax = createCompanySchema.parse({ name: maxName });
    assert.equal(parsedMax.name, maxName);
  });

  it('should reject missing or non-string company name', () => {
    assert.throws(
      () => createCompanySchema.parse({}),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => createCompanySchema.parse({ name: 12345 }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject company name shorter than 2 characters after trimming', () => {
    assert.throws(
      () => createCompanySchema.parse({ name: 'A' }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => createCompanySchema.parse({ name: '   A   ' }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => createCompanySchema.parse({ name: '    ' }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject company name exceeding 255 characters', () => {
    const tooLongName = 'C'.repeat(256);
    assert.throws(
      () => createCompanySchema.parse({ name: tooLongName }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject invalid website URL formats', () => {
    assert.throws(
      () =>
        createCompanySchema.parse({
          name: 'Valid Name',
          website: 'not-a-valid-url',
        }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () =>
        createCompanySchema.parse({
          name: 'Valid Name',
          website: 'ftp//invalid-scheme',
        }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject website URL exceeding 255 characters', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(250);
    assert.throws(
      () =>
        createCompanySchema.parse({
          name: 'Valid Name',
          website: longUrl,
        }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject invalid logo_url formats', () => {
    assert.throws(
      () =>
        createCompanySchema.parse({
          name: 'Valid Name',
          logo_url: 'just-a-string-not-url',
        }),
      (err) => err.name === 'ZodError'
    );
  });

  it('should reject logo_url exceeding 512 characters', () => {
    const longLogoUrl = 'https://example.com/' + 'b'.repeat(510);
    assert.throws(
      () =>
        createCompanySchema.parse({
          name: 'Valid Name',
          logo_url: longLogoUrl,
        }),
      (err) => err.name === 'ZodError'
    );
  });
});
