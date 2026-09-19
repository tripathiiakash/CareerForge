const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { ApplicationService } = require('../dist/modules/application/application.service');
const { QUEUE_NAMES } = require('../dist/core/queue/queue.types');

describe('Security Regression: Concurrent Application Status Mutation Race (FINDING-02)', () => {
  let service;
  let mockPrisma;
  let mockQueueService;
  let sentJobs;

  const validRecruiterUserId = '66666666-6666-4666-8666-666666666666';
  const validRecruiterId = '77777777-7777-4777-8777-777777777777';
  const validJobId = '33333333-3333-4333-8333-333333333333';
  const validApplicationId = '55555555-5555-4555-8555-555555555555';

  const baseApplication = {
    id: validApplicationId,
    job_id: validJobId,
    student_id: '22222222-2222-4222-8222-222222222222',
    resume_id: '44444444-4444-4444-8444-444444444444',
    status: 'APPLIED',
    applied_at: new Date('2024-02-10T14:30:00.000Z'),
    updated_at: new Date('2024-02-10T14:30:00.000Z'),
    job: {
      id: validJobId,
      recruiter_id: validRecruiterId,
    },
  };

  beforeEach(() => {
    sentJobs = [];

    mockQueueService = {
      send: async (queueName, data, options) => {
        sentJobs.push({ queueName, data, options });
        return 'mock-queue-job-id';
      },
    };

    mockPrisma = {
      recruiter: {
        findUnique: async () => ({
          id: validRecruiterId,
          user_id: validRecruiterUserId,
        }),
      },
      application: {
        findUnique: async () => ({ ...baseApplication }),
        update: async ({ where, data }) => ({
          id: where.id,
          status: data.status,
          updated_at: new Date('2024-02-12T09:15:00.000Z'),
        }),
      },
    };

    service = new ApplicationService(mockPrisma, mockQueueService);
  });

  // ---------------------------------------------------------------------------
  // 1. Atomic assertion in WHERE clause
  // ---------------------------------------------------------------------------
  it('1. passes expected status in update where clause to ensure atomicity', async () => {
    let capturedWhere = null;
    mockPrisma.application.update = async ({ where, data }) => {
      capturedWhere = where;
      return {
        id: where.id,
        status: data.status,
        updated_at: new Date(),
      };
    };

    await service.updateApplicationStatus(
      validRecruiterUserId,
      validApplicationId,
      { status: 'SHORTLISTED' }
    );

    assert.ok(capturedWhere, 'update must be invoked with where clause');
    assert.equal(capturedWhere.id, validApplicationId);
    assert.equal(
      capturedWhere.status,
      'APPLIED',
      'update WHERE clause must assert current validated status (APPLIED)'
    );
  });

  // ---------------------------------------------------------------------------
  // 2. Concurrent conflict throws HTTP 409 CONFLICT
  // ---------------------------------------------------------------------------
  it('2. converts Prisma P2025 to 409 ConflictException when status is modified concurrently', async () => {
    mockPrisma.application.update = async () => {
      // Simulate Prisma P2025 when row was modified concurrently and where condition matched 0 rows
      const p2025Error = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found. Record to update not found.',
        {
          code: 'P2025',
          clientVersion: '5.22.0',
        }
      );
      throw p2025Error;
    };

    await assert.rejects(
      () =>
        service.updateApplicationStatus(
          validRecruiterUserId,
          validApplicationId,
          { status: 'SHORTLISTED' }
        ),
      (err) => {
        assert.equal(err.getStatus?.() ?? err.status, 409, 'Must be HTTP 409 CONFLICT');
        const response = err.getResponse?.() ?? err.response;
        assert.equal(response.code, 'CONFLICT');
        assert.equal(
          response.message,
          'Application status was modified by another request. Please refresh.'
        );
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 3. No notification dispatched when concurrent update fails
  // ---------------------------------------------------------------------------
  it('3. does NOT dispatch status email notification when status update encounters concurrency conflict', async () => {
    mockPrisma.application.update = async () => {
      throw new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.22.0',
      });
    };

    await assert.rejects(
      () =>
        service.updateApplicationStatus(
          validRecruiterUserId,
          validApplicationId,
          { status: 'SHORTLISTED' }
        ),
      { status: 409 }
    );

    assert.equal(
      sentJobs.length,
      0,
      'No email job must be dispatched to queue when update loses concurrency race'
    );
  });

  // ---------------------------------------------------------------------------
  // 4. Sequential valid transitions succeed
  // ---------------------------------------------------------------------------
  it('4. allows valid sequential status transition APPLIED -> SHORTLISTED -> REJECTED', async () => {
    let currentStatus = 'APPLIED';
    mockPrisma.application.findUnique = async () => ({
      ...baseApplication,
      status: currentStatus,
    });
    mockPrisma.application.update = async ({ where, data }) => {
      assert.equal(where.status, currentStatus);
      currentStatus = data.status;
      return {
        id: where.id,
        status: data.status,
        updated_at: new Date(),
      };
    };

    // Step 1: APPLIED -> SHORTLISTED
    const res1 = await service.updateApplicationStatus(
      validRecruiterUserId,
      validApplicationId,
      { status: 'SHORTLISTED' }
    );
    assert.equal(res1.status, 'SHORTLISTED');
    assert.equal(sentJobs.length, 1);
    assert.equal(sentJobs[0].data.status, 'SHORTLISTED');

    // Step 2: SHORTLISTED -> REJECTED
    const res2 = await service.updateApplicationStatus(
      validRecruiterUserId,
      validApplicationId,
      { status: 'REJECTED' }
    );
    assert.equal(res2.status, 'REJECTED');
    assert.equal(sentJobs.length, 2);
    assert.equal(sentJobs[1].data.status, 'REJECTED');
  });

  // ---------------------------------------------------------------------------
  // 5. Terminal state protection remains intact
  // ---------------------------------------------------------------------------
  it('5. preserves terminal-state rejection (REJECTED cannot transition)', async () => {
    mockPrisma.application.findUnique = async () => ({
      ...baseApplication,
      status: 'REJECTED',
    });

    await assert.rejects(
      () =>
        service.updateApplicationStatus(
          validRecruiterUserId,
          validApplicationId,
          { status: 'SHORTLISTED' }
        ),
      (err) => {
        assert.equal(err.getStatus?.() ?? err.status, 400);
        const response = err.getResponse?.() ?? err.response;
        assert.equal(response.code, 'VALIDATION_ERROR');
        assert.equal(
          response.message,
          'Cannot transition application status from REJECTED to SHORTLISTED'
        );
        return true;
      }
    );

    assert.equal(sentJobs.length, 0);
  });

  // ---------------------------------------------------------------------------
  // 6. Authorization check remains enforced before update
  // ---------------------------------------------------------------------------
  it('6. preserves 403 Forbidden check when recruiter does not own parent job', async () => {
    mockPrisma.application.findUnique = async () => ({
      ...baseApplication,
      job: {
        id: validJobId,
        recruiter_id: 'different-recruiter-999',
      },
    });

    await assert.rejects(
      () =>
        service.updateApplicationStatus(
          validRecruiterUserId,
          validApplicationId,
          { status: 'SHORTLISTED' }
        ),
      (err) => {
        assert.equal(err.getStatus?.() ?? err.status, 403);
        const response = err.getResponse?.() ?? err.response;
        assert.equal(response.code, 'FORBIDDEN');
        assert.equal(response.message, 'Recruiter does not own the parent job');
        return true;
      }
    );

    assert.equal(sentJobs.length, 0);
  });
});
