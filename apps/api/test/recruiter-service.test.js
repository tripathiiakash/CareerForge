const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  RecruiterService,
} = require('../dist/modules/recruiter/recruiter.service');

describe('RecruiterService Test Suite', () => {
  let service;
  let mockPrisma;

  const validUserId = '11111111-1111-4111-8111-111111111111';
  const recruiterId = '22222222-2222-4222-8222-222222222222';
  const companyId = '33333333-3333-4333-8333-333333333333';
  const newCompanyId = '44444444-4444-4444-8444-444444444444';

  const sampleCompany = {
    id: companyId,
    name: 'TechNova Solutions',
    website: 'https://technova.example.com',
    logo_url: 'https://s3.amazonaws.com/bucket/logo.png',
  };

  const sampleRecruiter = {
    id: recruiterId,
    user_id: validUserId,
    company_id: companyId,
    first_name: 'Sarah',
    last_name: 'Connor',
    is_approved: true,
    company: sampleCompany,
  };

  beforeEach(() => {
    mockPrisma = {
      recruiter: {
        findUnique: async () => null,
        update: async () => null,
      },
      company: {
        findUnique: async () => null,
      },
    };

    service = new RecruiterService(mockPrisma);
  });

  describe('getProfileByUserId', () => {
    it('should throw 404 NotFoundException if recruiter profile does not exist', async () => {
      mockPrisma.recruiter.findUnique = async () => null;

      await assert.rejects(
        () => service.getProfileByUserId(validUserId),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Recruiter profile does not exist'
      );
    });

    it('should return recruiter profile with linked company data adhering to docs/API.md §4.1', async () => {
      mockPrisma.recruiter.findUnique = async () => sampleRecruiter;

      const result = await service.getProfileByUserId(validUserId);

      assert.equal(result.id, recruiterId);
      assert.equal(result.first_name, 'Sarah');
      assert.equal(result.last_name, 'Connor');
      assert.equal(result.is_approved, true);
      assert.deepEqual(result.company, sampleCompany);
      // Ensure user_id or internal security details are not exposed
      assert.equal(result.user_id, undefined);
    });
  });

  describe('updateProfileByUserId', () => {
    it('should throw 404 NotFoundException if recruiter profile does not exist', async () => {
      mockPrisma.recruiter.findUnique = async () => null;

      await assert.rejects(
        () => service.updateProfileByUserId(validUserId, { first_name: 'Jane' }),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Recruiter profile does not exist'
      );
    });

    it('should throw 404 NotFoundException if specified company_id does not exist in companies table', async () => {
      mockPrisma.recruiter.findUnique = async () => sampleRecruiter;
      mockPrisma.company.findUnique = async () => null; // Nonexistent company

      await assert.rejects(
        () =>
          service.updateProfileByUserId(validUserId, {
            company_id: newCompanyId,
          }),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message ===
            'Specified company_id does not exist in the companies table'
      );
    });

    it('should partially update first_name and last_name when company_id is omitted', async () => {
      mockPrisma.recruiter.findUnique = async () => sampleRecruiter;

      let updateArgs = null;
      mockPrisma.recruiter.update = async (args) => {
        updateArgs = args;
        return {
          ...sampleRecruiter,
          first_name: 'Alex',
          last_name: 'Vance',
        };
      };

      const result = await service.updateProfileByUserId(validUserId, {
        first_name: 'Alex',
        last_name: 'Vance',
      });

      assert.equal(updateArgs.where.user_id, validUserId);
      assert.equal(updateArgs.data.first_name, 'Alex');
      assert.equal(updateArgs.data.last_name, 'Vance');
      assert.equal(updateArgs.data.company_id, undefined);
      assert.equal(result.first_name, 'Alex');
      assert.equal(result.last_name, 'Vance');
      assert.deepEqual(result.company, sampleCompany);
    });

    it('should update company_id when target company exists', async () => {
      const newCompany = {
        id: newCompanyId,
        name: 'Initech Global',
        website: 'https://initech.example.com',
        logo_url: null,
      };

      mockPrisma.recruiter.findUnique = async () => sampleRecruiter;
      mockPrisma.company.findUnique = async ({ where }) => {
        if (where.id === newCompanyId) return newCompany;
        return null;
      };

      let updateArgs = null;
      mockPrisma.recruiter.update = async (args) => {
        updateArgs = args;
        return {
          ...sampleRecruiter,
          company_id: newCompanyId,
          company: newCompany,
        };
      };

      const result = await service.updateProfileByUserId(validUserId, {
        company_id: newCompanyId,
      });

      assert.equal(updateArgs.data.company_id, newCompanyId);
      assert.equal(result.company.id, newCompanyId);
      assert.equal(result.company.name, 'Initech Global');
    });
  });
});
