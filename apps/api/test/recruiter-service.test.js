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
      assert.equal(result.is_company_assigned, true);
      assert.deepEqual(result.company, sampleCompany);
      // Ensure user_id or internal security details are not exposed
      assert.equal(result.user_id, undefined);
    });

    it('should return is_company_assigned=false when company is registration placeholder (empty name)', async () => {
      mockPrisma.recruiter.findUnique = async () => ({
        ...sampleRecruiter,
        company: {
          id: 'placeholder-company-id',
          name: '',
          website: null,
          logo_url: null,
        },
      });

      const result = await service.getProfileByUserId(validUserId);

      assert.equal(result.is_company_assigned, false);
      assert.equal(result.company.name, '');
    });
  });

  describe('updateProfileByUserId', () => {
    it('should throw 404 NotFoundException if recruiter profile does not exist', async () => {
      mockPrisma.recruiter.findUnique = async () => null;

      await assert.rejects(
        () =>
          service.updateProfileByUserId(validUserId, { first_name: 'Jane' }),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Recruiter profile does not exist'
      );
    });

    it('should ignore company_id in dto and not allow recruiter to self-assign company_id', async () => {
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
        company_id: newCompanyId,
      });

      assert.equal(updateArgs.where.user_id, validUserId);
      assert.equal(updateArgs.data.first_name, 'Alex');
      assert.equal(updateArgs.data.last_name, 'Vance');
      assert.equal(updateArgs.data.company_id, undefined);
      assert.equal(result.first_name, 'Alex');
      assert.equal(result.last_name, 'Vance');
      assert.deepEqual(result.company, sampleCompany);
      assert.equal(result.is_company_assigned, true);
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
      assert.equal(result.is_company_assigned, true);
      assert.deepEqual(result.company, sampleCompany);
    });

    it('should return is_company_assigned=false when updating recruiter with placeholder company', async () => {
      const placeholderCompany = {
        id: 'placeholder-id',
        name: '',
        website: null,
        logo_url: null,
      };

      mockPrisma.recruiter.findUnique = async () => ({
        ...sampleRecruiter,
        company: placeholderCompany,
      });

      mockPrisma.recruiter.update = async () => ({
        ...sampleRecruiter,
        first_name: 'Alex',
        company: placeholderCompany,
      });

      const result = await service.updateProfileByUserId(validUserId, {
        first_name: 'Alex',
      });

      assert.equal(result.first_name, 'Alex');
      assert.equal(result.is_company_assigned, false);
    });
  });
});
