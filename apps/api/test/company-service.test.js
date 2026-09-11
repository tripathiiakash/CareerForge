const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { CompanyService } = require('../dist/modules/company/company.service');

describe('CompanyService Test Suite (Phase 4.2.2)', () => {
  let service;
  let mockPrisma;

  const validCompanyId = '1d8b67b1-419b-43d8-a53c-ebc4d32fbb47';

  beforeEach(() => {
    mockPrisma = {
      company: {
        findFirst: async () => null,
        create: async () => null,
      },
    };

    service = new CompanyService(mockPrisma);
  });

  describe('createCompany', () => {
    it('1. successful company creation with all fields', async () => {
      let createArgs = null;
      mockPrisma.company.findFirst = async () => null;
      mockPrisma.company.create = async (args) => {
        createArgs = args;
        return {
          id: validCompanyId,
          name: args.data.name,
          website: args.data.website,
          logo_url: args.data.logo_url,
        };
      };

      const input = {
        name: 'TechNova Solutions',
        website: 'https://technova.example.com',
        logo_url: 'https://s3.amazonaws.com/bucket/logo.png',
      };

      const result = await service.createCompany(input);

      assert.equal(result.id, validCompanyId);
      assert.equal(result.name, 'TechNova Solutions');
      assert.equal(result.website, 'https://technova.example.com');
      assert.equal(result.logo_url, 'https://s3.amazonaws.com/bucket/logo.png');

      assert.equal(createArgs.data.name, 'TechNova Solutions');
      assert.equal(createArgs.data.website, 'https://technova.example.com');
      assert.equal(
        createArgs.data.logo_url,
        'https://s3.amazonaws.com/bucket/logo.png'
      );
    });

    it('2. correct mapping of returned public fields (id, name, website, logo_url)', async () => {
      mockPrisma.company.create = async () => ({
        id: validCompanyId,
        name: 'Acme Corp',
        website: 'https://acme.example.com',
        logo_url: 'https://acme.example.com/logo.png',
      });

      const result = await service.createCompany({ name: 'Acme Corp' });

      assert.deepEqual(
        Object.keys(result).sort(),
        ['id', 'logo_url', 'name', 'website'].sort()
      );
      assert.equal(result.id, validCompanyId);
      assert.equal(result.name, 'Acme Corp');
    });

    it('3. nullable website/logo_url behavior (handles omitted and null values)', async () => {
      let createArgs = null;
      mockPrisma.company.create = async (args) => {
        createArgs = args;
        return {
          id: validCompanyId,
          name: args.data.name,
          website: args.data.website,
          logo_url: args.data.logo_url,
        };
      };

      // Omitted website and logo_url
      const resultOmitted = await service.createCompany({
        name: 'Minimal Corp',
      });
      assert.equal(createArgs.data.website, null);
      assert.equal(createArgs.data.logo_url, null);
      assert.equal(resultOmitted.website, null);
      assert.equal(resultOmitted.logo_url, null);

      // Explicit null website and logo_url
      const resultNull = await service.createCompany({
        name: 'Explicit Null Corp',
        website: null,
        logo_url: null,
      });
      assert.equal(createArgs.data.website, null);
      assert.equal(createArgs.data.logo_url, null);
      assert.equal(resultNull.website, null);
      assert.equal(resultNull.logo_url, null);
    });

    it('4. ensuring internal fields (created_at, arbitrary properties) are not exposed', async () => {
      const internalTimestamp = new Date('2024-01-01T00:00:00.000Z');
      mockPrisma.company.create = async () => ({
        id: validCompanyId,
        name: 'Secure Corp',
        website: null,
        logo_url: null,
        created_at: internalTimestamp,
        internal_salt: 'sensitive-hash',
        secret_metadata: { admin: true },
      });

      const result = await service.createCompany({ name: 'Secure Corp' });

      assert.equal(result.created_at, undefined);
      assert.equal(result.internal_salt, undefined);
      assert.equal(result.secret_metadata, undefined);
      assert.equal('created_at' in result, false);
      assert.equal('internal_salt' in result, false);
      assert.equal('secret_metadata' in result, false);
      assert.deepEqual(
        Object.keys(result).sort(),
        ['id', 'logo_url', 'name', 'website'].sort()
      );
    });

    it('5. Prisma/create failure propagation according to existing error conventions', async () => {
      const dbError = new Error('Database connection failed');
      mockPrisma.company.create = async () => {
        throw dbError;
      };

      await assert.rejects(
        () => service.createCompany({ name: 'Failing Corp' }),
        (err) => err === dbError && err.message === 'Database connection failed'
      );
    });

    it('6. duplicate company name throws 409 ConflictException (case-insensitive & trimmed)', async () => {
      mockPrisma.company.findFirst = async ({ where }) => {
        if (where.name.equals === 'TechNova Solutions') {
          return {
            id: 'existing-id',
            name: 'TechNova Solutions',
            created_at: new Date(),
          };
        }
        return null;
      };

      await assert.rejects(
        () => service.createCompany({ name: '  TechNova Solutions  ' }),
        (err) =>
          err.status === 409 &&
          err.response.code === 'CONFLICT' &&
          err.response.message === 'Company with this name already exists'
      );
    });

    it('7. does not forward client-supplied internal properties to prisma.company.create', async () => {
      let passedData = null;
      mockPrisma.company.create = async (args) => {
        passedData = args.data;
        return {
          id: validCompanyId,
          name: args.data.name,
          website: args.data.website,
          logo_url: args.data.logo_url,
        };
      };

      const untrustedInput = {
        name: 'Untrusted Payload Corp',
        id: 'client-supplied-uuid-attempt',
        created_at: '2099-01-01',
        arbitrary_prisma_field: 'malicious',
      };

      await service.createCompany(untrustedInput);

      assert.equal(passedData.id, undefined);
      assert.equal(passedData.created_at, undefined);
      assert.equal(passedData.arbitrary_prisma_field, undefined);
      assert.deepEqual(passedData, {
        name: 'Untrusted Payload Corp',
        website: null,
        logo_url: null,
      });
    });
  });
});
