const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { NotFoundException } = require('@nestjs/common');
const { StudentService } = require('../dist/modules/student/student.service');

describe('StudentService Core Regression Test Suite (Phase 6.6-C)', () => {
  let studentService;
  let mockPrisma;

  // Tracked Prisma invocation parameters
  let findUniqueCallCount;
  let lastFindUniqueArgs;
  let updateCallCount;
  let lastUpdateArgs;

  const validUserId = '11111111-1111-4111-8111-111111111111';
  const validStudentId = '22222222-2222-4222-8222-222222222222';
  const otherUserId = '33333333-3333-4333-8333-333333333333';

  const sampleStudentRecord = {
    id: validStudentId,
    first_name: 'Alex',
    last_name: 'Rivera',
    university: 'University of California, Berkeley',
    graduation_year: 2025,
    degree: 'Computer Science, B.S.',
    skills: ['typescript', 'react', 'postgresql'],
    github_url: 'https://github.com/alexrivera',
    linkedin_url: 'https://linkedin.com/in/alexrivera',
  };

  beforeEach(() => {
    findUniqueCallCount = 0;
    lastFindUniqueArgs = null;
    updateCallCount = 0;
    lastUpdateArgs = null;

    mockPrisma = {
      student: {
        findUnique: async (args) => {
          findUniqueCallCount++;
          lastFindUniqueArgs = args;
          if (args?.where?.user_id === validUserId) {
            return { ...sampleStudentRecord };
          }
          return null;
        },
        update: async (args) => {
          updateCallCount++;
          lastUpdateArgs = args;
          return {
            id: validStudentId,
            first_name: args.data.first_name ?? sampleStudentRecord.first_name,
            last_name: args.data.last_name ?? sampleStudentRecord.last_name,
            university:
              args.data.university !== undefined
                ? args.data.university
                : sampleStudentRecord.university,
            graduation_year:
              args.data.graduation_year !== undefined
                ? args.data.graduation_year
                : sampleStudentRecord.graduation_year,
            degree:
              args.data.degree !== undefined
                ? args.data.degree
                : sampleStudentRecord.degree,
            skills: args.data.skills ?? sampleStudentRecord.skills,
            github_url:
              args.data.github_url !== undefined
                ? args.data.github_url
                : sampleStudentRecord.github_url,
            linkedin_url:
              args.data.linkedin_url !== undefined
                ? args.data.linkedin_url
                : sampleStudentRecord.linkedin_url,
          };
        },
      },
    };

    studentService = new StudentService(mockPrisma);
  });

  // ===========================================================================
  // 1. GET PROFILE TESTS
  // ===========================================================================
  describe('1. getProfileByUserId', () => {
    it('1.1. should return existing student profile with expected fields adhering to API contract', async () => {
      const profile = await studentService.getProfileByUserId(validUserId);

      assert.equal(findUniqueCallCount, 1);
      assert.deepEqual(lastFindUniqueArgs.where, { user_id: validUserId });

      // Verify the expected select whitelist
      assert.deepEqual(lastFindUniqueArgs.select, {
        id: true,
        first_name: true,
        last_name: true,
        university: true,
        graduation_year: true,
        degree: true,
        skills: true,
        github_url: true,
        linkedin_url: true,
      });

      // Verify exact return structure
      assert.equal(profile.id, validStudentId);
      assert.equal(profile.first_name, 'Alex');
      assert.equal(profile.last_name, 'Rivera');
      assert.equal(profile.university, 'University of California, Berkeley');
      assert.equal(profile.graduation_year, 2025);
      assert.equal(profile.degree, 'Computer Science, B.S.');
      assert.deepEqual(profile.skills, ['typescript', 'react', 'postgresql']);
      assert.equal(profile.github_url, 'https://github.com/alexrivera');
      assert.equal(profile.linkedin_url, 'https://linkedin.com/in/alexrivera');
    });

    it('1.2. should throw 404 NotFoundException when student profile does not exist', async () => {
      await assert.rejects(
        () => studentService.getProfileByUserId('nonexistent-user-id'),
        (err) => {
          assert.ok(err instanceof NotFoundException);
          assert.equal(err.status, 404);
          assert.equal(err.response.code, 'NOT_FOUND');
          assert.equal(
            err.response.message,
            'Student profile record does not exist'
          );
          return true;
        }
      );

      assert.equal(findUniqueCallCount, 1);
    });

    it('1.3. should never query or leak sensitive User fields (password_hash, is_banned, user_id)', async () => {
      const profile = await studentService.getProfileByUserId(validUserId);

      // Verify select clause does NOT request sensitive user relation or internal metadata
      const selectKeys = Object.keys(lastFindUniqueArgs.select);
      assert.equal(selectKeys.includes('user'), false);
      assert.equal(selectKeys.includes('password_hash'), false);
      assert.equal(selectKeys.includes('is_banned'), false);
      assert.equal(selectKeys.includes('created_at'), false);
      assert.equal(selectKeys.includes('updated_at'), false);

      // Verify returned object keys are strictly safe
      const returnedKeys = Object.keys(profile);
      assert.equal(returnedKeys.includes('password_hash'), false);
      assert.equal(returnedKeys.includes('password'), false);
      assert.equal(returnedKeys.includes('user_id'), false);
      assert.equal(returnedKeys.includes('is_banned'), false);
    });
  });

  // ===========================================================================
  // 2. PROFILE UPDATE TESTS
  // ===========================================================================
  describe('2. updateProfileByUserId', () => {
    it('2.1. should successfully apply partial profile update and return updated profile', async () => {
      const updateDto = {
        first_name: 'Alexandra',
        degree: 'Software Engineering, M.S.',
        graduation_year: 2026,
      };

      const result = await studentService.updateProfileByUserId(
        validUserId,
        updateDto
      );

      assert.equal(findUniqueCallCount, 1);
      assert.equal(updateCallCount, 1);

      // Verify update was scoped to the user
      assert.deepEqual(lastUpdateArgs.where, { user_id: validUserId });

      // Verify data sent to Prisma contains only updated fields
      assert.deepEqual(lastUpdateArgs.data, {
        first_name: 'Alexandra',
        degree: 'Software Engineering, M.S.',
        graduation_year: 2026,
      });

      // Verify returned object reflects updates
      assert.equal(result.first_name, 'Alexandra');
      assert.equal(result.degree, 'Software Engineering, M.S.');
      assert.equal(result.graduation_year, 2026);
      assert.equal(result.last_name, 'Rivera'); // preserved
    });

    it('2.2. should preserve fields omitted from partial update (only defined fields sent to Prisma)', async () => {
      const updateDto = {
        university: 'Stanford University',
      };

      await studentService.updateProfileByUserId(validUserId, updateDto);

      assert.equal(updateCallCount, 1);
      // Ensure only university was included in data; omitted fields are NOT undefined keys
      assert.deepEqual(lastUpdateArgs.data, {
        university: 'Stanford University',
      });
      assert.equal('first_name' in lastUpdateArgs.data, false);
      assert.equal('last_name' in lastUpdateArgs.data, false);
      assert.equal('degree' in lastUpdateArgs.data, false);
      assert.equal('skills' in lastUpdateArgs.data, false);
    });

    it('2.3. should allow nullable fields to be explicitly cleared with null', async () => {
      const updateDto = {
        university: null,
        degree: null,
        graduation_year: null,
        github_url: null,
        linkedin_url: null,
      };

      const result = await studentService.updateProfileByUserId(
        validUserId,
        updateDto
      );

      assert.equal(updateCallCount, 1);
      assert.deepEqual(lastUpdateArgs.data, {
        university: null,
        degree: null,
        graduation_year: null,
        github_url: null,
        linkedin_url: null,
      });

      assert.equal(result.university, null);
      assert.equal(result.degree, null);
      assert.equal(result.graduation_year, null);
      assert.equal(result.github_url, null);
      assert.equal(result.linkedin_url, null);
    });

    it('2.4. should throw 404 NotFoundException when attempting to update nonexistent student profile', async () => {
      await assert.rejects(
        () =>
          studentService.updateProfileByUserId('unknown-user-id', {
            first_name: 'Ghost',
          }),
        (err) => {
          assert.ok(err instanceof NotFoundException);
          assert.equal(err.status, 404);
          assert.equal(err.response.code, 'NOT_FOUND');
          assert.equal(
            err.response.message,
            'Student profile record does not exist'
          );
          return true;
        }
      );

      // Verify update was never called when existence check failed
      assert.equal(findUniqueCallCount, 1);
      assert.equal(updateCallCount, 0);
    });

    it('2.5. should select strictly whitelisted safe fields on update and avoid leaking internal metadata', async () => {
      const result = await studentService.updateProfileByUserId(validUserId, {
        first_name: 'Alex',
      });

      assert.deepEqual(lastUpdateArgs.select, {
        id: true,
        first_name: true,
        last_name: true,
        university: true,
        graduation_year: true,
        degree: true,
        skills: true,
        github_url: true,
        linkedin_url: true,
      });

      const forbiddenKeys = [
        'password_hash',
        'password',
        'user_id',
        'created_at',
        'updated_at',
      ];
      for (const key of forbiddenKeys) {
        assert.equal(key in result, false, `Key ${key} must not be returned`);
      }
    });
  });

  // ===========================================================================
  // 3. SKILL NORMALIZATION TESTS
  // ===========================================================================
  describe('3. Skill Normalization & Deduplication', () => {
    it('3.1. should normalize all skills to lowercase', async () => {
      await studentService.updateProfileByUserId(validUserId, {
        skills: ['TypeScript', 'NestJS', 'Docker', 'PostgreSQL'],
      });

      assert.equal(updateCallCount, 1);
      assert.deepEqual(lastUpdateArgs.data.skills, [
        'typescript',
        'nestjs',
        'docker',
        'postgresql',
      ]);
    });

    it('3.2. should deduplicate skills with identical lowercase values', async () => {
      await studentService.updateProfileByUserId(validUserId, {
        skills: ['react', 'React', 'REACT', 'reAct'],
      });

      assert.equal(updateCallCount, 1);
      assert.deepEqual(lastUpdateArgs.data.skills, ['react']);
    });

    it('3.3. should handle mixed-case variants and preserve distinct lowercase skills', async () => {
      await studentService.updateProfileByUserId(validUserId, {
        skills: [
          'JavaScript',
          'javascript',
          'JAVASCRIPT',
          'Node.js',
          'node.js',
          'Python',
        ],
      });

      assert.equal(updateCallCount, 1);
      assert.deepEqual(lastUpdateArgs.data.skills, [
        'javascript',
        'node.js',
        'python',
      ]);
    });

    it('3.4. should support resetting skills to an empty array []', async () => {
      await studentService.updateProfileByUserId(validUserId, {
        skills: [],
      });

      assert.equal(updateCallCount, 1);
      assert.deepEqual(lastUpdateArgs.data.skills, []);
    });

    it('3.5. should omit skills from update payload when skills property is undefined', async () => {
      await studentService.updateProfileByUserId(validUserId, {
        first_name: 'Alex',
        // skills is undefined (omitted)
      });

      assert.equal(updateCallCount, 1);
      assert.equal('skills' in lastUpdateArgs.data, false);
    });
  });

  // ===========================================================================
  // 4. OWNERSHIP & USER ISOLATION
  // ===========================================================================
  describe('4. Ownership & User Isolation Boundaries', () => {
    it('4.1. should strictly scope profile lookup by authenticated userId preventing cross-user data leakage', async () => {
      // Calling getProfileByUserId for validUserId returns valid student
      const profileA = await studentService.getProfileByUserId(validUserId);
      assert.equal(profileA.id, validStudentId);

      // Calling with another userId for which no profile is linked returns 404
      await assert.rejects(
        () => studentService.getProfileByUserId(otherUserId),
        (err) => err.status === 404
      );

      assert.deepEqual(lastFindUniqueArgs.where, { user_id: otherUserId });
    });

    it('4.2. should strictly scope profile updates by authenticated userId preventing unauthorized modifications', async () => {
      await assert.rejects(
        () =>
          studentService.updateProfileByUserId(otherUserId, {
            first_name: 'Malicious',
          }),
        (err) => err.status === 404
      );

      // Verify update was never dispatched for other user
      assert.equal(updateCallCount, 0);
    });
  });
});
