const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const {
  ApplicationService,
} = require('../dist/modules/application/application.service');

describe('ApplicationService Test Suite (Phase 4.4.1 - docs/API.md §8.1)', () => {
  let service;
  let mockPrisma;

  const validUserId = '11111111-1111-4111-8111-111111111111';
  const validStudentId = '22222222-2222-4222-8222-222222222222';
  const validJobId = '33333333-3333-4333-8333-333333333333';
  const validResumeId = '44444444-4444-4444-8444-444444444444';
  const validApplicationId = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    mockPrisma = {
      student: {
        findUnique: async () => ({
          id: validStudentId,
          user_id: validUserId,
        }),
      },
      job: {
        findUnique: async () => ({
          id: validJobId,
          status: 'ACTIVE',
        }),
      },
      resume: {
        findUnique: async () => ({
          id: validResumeId,
          student_id: validStudentId,
        }),
      },
      application: {
        findUnique: async () => null,
        create: async ({ data }) => ({
          id: validApplicationId,
          job_id: data.job_id,
          student_id: data.student_id,
          resume_id: data.resume_id,
          status: data.status,
          applied_at: new Date('2024-02-10T14:30:00.000Z'),
        }),
      },
    };

    service = new ApplicationService(mockPrisma);
  });

  describe('applyToJob', () => {
    it('1. successful application creation with APPLIED status and documented envelope', async () => {
      let createdData = null;
      mockPrisma.application.create = async ({ data }) => {
        createdData = data;
        return {
          id: validApplicationId,
          job_id: data.job_id,
          student_id: data.student_id,
          resume_id: data.resume_id,
          status: data.status,
          applied_at: new Date('2024-02-10T14:30:00.000Z'),
        };
      };

      const result = await service.applyToJob(validUserId, validJobId, {
        resume_id: validResumeId,
      });

      assert.equal(createdData.job_id, validJobId);
      assert.equal(createdData.student_id, validStudentId);
      assert.equal(createdData.resume_id, validResumeId);
      assert.equal(createdData.status, 'APPLIED');

      assert.deepEqual(result, {
        application_id: validApplicationId,
        status: 'APPLIED',
        applied_at: new Date('2024-02-10T14:30:00.000Z'),
        message: 'Successfully applied to the job.',
      });
    });

    it('2. rejects invalid jobId UUID with 400 VALIDATION_ERROR', async () => {
      await assert.rejects(
        () =>
          service.applyToJob(validUserId, 'not-a-uuid', {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message.includes('jobId')
      );
    });

    it('3. rejects invalid resume_id UUID with 400 VALIDATION_ERROR', async () => {
      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: 'not-a-uuid',
          }),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message.includes('resume_id')
      );
    });

    it('4. rejects with 404 NOT_FOUND when student profile does not exist', async () => {
      mockPrisma.student.findUnique = async () => null;

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Student profile does not exist'
      );
    });

    it('5. rejects with 404 NOT_FOUND when job does not exist', async () => {
      mockPrisma.job.findUnique = async () => null;

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Job does not exist'
      );
    });

    it('6. rejects with 400 VALIDATION_ERROR when job is in PENDING status', async () => {
      mockPrisma.job.findUnique = async () => ({
        id: validJobId,
        status: 'PENDING',
      });

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message === 'Job is not in ACTIVE status'
      );
    });

    it('7. rejects with 400 VALIDATION_ERROR when job is in REJECTED status', async () => {
      mockPrisma.job.findUnique = async () => ({
        id: validJobId,
        status: 'REJECTED',
      });

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message === 'Job is not in ACTIVE status'
      );
    });

    it('8. rejects with 404 NOT_FOUND when resume does not exist', async () => {
      mockPrisma.resume.findUnique = async () => null;

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Resume does not exist'
      );
    });

    it('9. rejects with 403 FORBIDDEN when resume belongs to another student (BOLA/IDOR protection)', async () => {
      mockPrisma.resume.findUnique = async () => ({
        id: validResumeId,
        student_id: '99999999-9999-4999-8999-999999999999', // Different student
      });

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 403 &&
          err.response.code === 'FORBIDDEN' &&
          err.response.message ===
            'Resume does not belong to the authenticated student'
      );
    });

    it('10. rejects with 409 CONFLICT when student has already applied to the job (pre-check)', async () => {
      mockPrisma.application.findUnique = async () => ({
        id: 'existing-application-id',
        job_id: validJobId,
        student_id: validStudentId,
      });

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 409 &&
          err.response.code === 'CONFLICT' &&
          err.response.message === 'Student has already applied to this job'
      );
    });

    it('11. rejects with 409 CONFLICT when unique constraint (P2002) is triggered on race condition', async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint violation on (job_id, student_id)',
        { code: 'P2002', clientVersion: '5.x' }
      );
      mockPrisma.application.create = async () => {
        throw p2002Error;
      };

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 409 &&
          err.response.code === 'CONFLICT' &&
          err.response.message === 'Student has already applied to this job'
      );
    });

    it('12. security: student_id and status cannot be manipulated by client', async () => {
      let createdData = null;
      mockPrisma.application.create = async ({ data }) => {
        createdData = data;
        return {
          id: validApplicationId,
          job_id: data.job_id,
          student_id: data.student_id,
          resume_id: data.resume_id,
          status: data.status,
          applied_at: new Date(),
        };
      };

      await service.applyToJob(validUserId, validJobId, {
        resume_id: validResumeId,
        // Even if client tried to pass extra fields (which Zod blocks anyway):
        student_id: 'attacker-student-id',
        status: 'SHORTLISTED',
      });

      assert.equal(createdData.student_id, validStudentId);
      assert.equal(createdData.status, 'APPLIED');
    });

    it('13. propagates unexpected database errors cleanly', async () => {
      const dbError = new Error('Database query failure');
      mockPrisma.student.findUnique = async () => {
        throw dbError;
      };

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) => err === dbError
      );
    });
  });
});
