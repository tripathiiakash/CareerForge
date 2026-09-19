import { PrismaClient } from '@prisma/client';

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5432/careerforge_e2e?schema=public';

export const TEST_STUDENT_EMAIL = 'alex.taylor.e2e@careerforge.test';
export const TEST_STUDENT_PASSWORD = 'Password123!';
export const TEST_RECRUITER_EMAIL = 'recruiter.e2e@careerforge.test';

// Deterministic UUIDs for E2E fixtures
export const E2E_STUDENT_USER_ID = 'e2e00001-0000-4000-8000-000000000001';
export const E2E_STUDENT_PROFILE_ID = 'e2e00001-0000-4000-8000-000000000002';
export const E2E_STUDENT_RESUME_ID = 'e2e00001-0000-4000-8000-000000000003';
export const E2E_RECRUITER_USER_ID = 'e2e00002-0000-4000-8000-000000000001';
export const E2E_COMPANY_ID = 'e2e00002-0000-4000-8000-000000000002';
export const E2E_RECRUITER_PROFILE_ID = 'e2e00002-0000-4000-8000-000000000003';
export const E2E_JOB_FULLTIME_ID = 'e2e00003-0000-4000-8000-000000000001';
export const E2E_JOB_INTERNSHIP_ID = 'e2e00003-0000-4000-8000-000000000002';

// Precomputed bcrypt hash of "Password123!"
const BCRYPT_PASSWORD_HASH =
  '$2b$10$CGDOkXzIi3D7KZKrbOjTw.8bm5yg2Xkfy5vPaaq7nlsrNwZp2Fu3K';

export function assertSafeE2EDatabase(url: string): void {
  const parsed = new URL(url);
  const dbName = parsed.pathname.replace(/^\//, '').split('/')[0]?.split('?')[0];

  if (!dbName || !dbName.toLowerCase().endsWith('_e2e')) {
    throw new Error(
      `SAFETY VIOLATION: E2E database URL must strictly target an '_e2e' database (e.g. careerforge_e2e). Received '${dbName}'`
    );
  }
}

export function createE2EPrisma(): PrismaClient {
  assertSafeE2EDatabase(E2E_DATABASE_URL);
  return new PrismaClient({
    datasources: {
      db: {
        url: E2E_DATABASE_URL,
      },
    },
  });
}

export async function seedE2EFixtures(): Promise<void> {
  assertSafeE2EDatabase(E2E_DATABASE_URL);
  const prisma = createE2EPrisma();

  try {
    // 1. Clean existing E2E fixture records first
    await cleanE2EFixturesInternal(prisma);

    // 2. Seed Test Student User & Profile
    await prisma.user.create({
      data: {
        id: E2E_STUDENT_USER_ID,
        email: TEST_STUDENT_EMAIL,
        password_hash: BCRYPT_PASSWORD_HASH,
        role: 'STUDENT',
        is_banned: false,
        student: {
          create: {
            id: E2E_STUDENT_PROFILE_ID,
            first_name: 'Alex',
            last_name: 'Taylor',
            university: 'Stanford University',
            degree: 'B.S. Computer Science',
            graduation_year: 2025,
            skills: ['typescript', 'react', 'node.js', 'postgresql'],
            github_url: 'https://github.com/alextaylor',
            linkedin_url: 'https://linkedin.com/in/alextaylor',
            resumes: {
              create: {
                id: E2E_STUDENT_RESUME_ID,
                file_key: 'e2e/alex_taylor_resume.pdf',
                file_url: '/uploads/resumes/alex_taylor_resume.pdf',
                parsed_text: 'Alex Taylor software engineer skills: react typescript postgresql',
                is_primary: true,
              },
            },
          },
        },
      },
    });

    // 3. Seed Company & Recruiter
    const company = await prisma.company.create({
      data: {
        id: E2E_COMPANY_ID,
        name: 'Apex Cloud Solutions',
        website: 'https://apexcloud.dev',
      },
    });

    await prisma.user.create({
      data: {
        id: E2E_RECRUITER_USER_ID,
        email: TEST_RECRUITER_EMAIL,
        password_hash: BCRYPT_PASSWORD_HASH,
        role: 'RECRUITER',
        is_banned: false,
        recruiter: {
          create: {
            id: E2E_RECRUITER_PROFILE_ID,
            company_id: company.id,
            first_name: 'Sarah',
            last_name: 'Jenkins',
            is_approved: true,
          },
        },
      },
    });

    // 4. Seed Active Jobs
    await prisma.job.createMany({
      data: [
        {
          id: E2E_JOB_FULLTIME_ID,
          recruiter_id: E2E_RECRUITER_PROFILE_ID,
          company_id: E2E_COMPANY_ID,
          title: 'Senior Full-Stack Engineer',
          description:
            'Apex Cloud Solutions is seeking an experienced full-stack engineer proficient in TypeScript, React, and distributed systems.',
          required_skills: ['typescript', 'react', 'node.js', 'postgresql'],
          employment_type: 'FULL_TIME',
          status: 'ACTIVE',
        },
        {
          id: E2E_JOB_INTERNSHIP_ID,
          recruiter_id: E2E_RECRUITER_PROFILE_ID,
          company_id: E2E_COMPANY_ID,
          title: 'Frontend Engineering Intern',
          description:
            'Exciting summer internship for aspiring frontend developers looking to build modern UI with React and TailwindCSS.',
          required_skills: ['react', 'css', 'javascript'],
          employment_type: 'INTERNSHIP',
          status: 'ACTIVE',
        },
      ],
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanE2EFixturesInternal(prisma: PrismaClient): Promise<void> {
  // FK-safe deletion in reverse dependency order
  await prisma.application.deleteMany({
    where: {
      OR: [
        { student_id: E2E_STUDENT_PROFILE_ID },
        { job_id: { in: [E2E_JOB_FULLTIME_ID, E2E_JOB_INTERNSHIP_ID] } },
      ],
    },
  });

  await prisma.interviewPrepLog.deleteMany({
    where: {
      OR: [
        { student_id: E2E_STUDENT_PROFILE_ID },
        { job_id: { in: [E2E_JOB_FULLTIME_ID, E2E_JOB_INTERNSHIP_ID] } },
      ],
    },
  });

  await prisma.resume.deleteMany({
    where: { student_id: E2E_STUDENT_PROFILE_ID },
  });

  await prisma.job.deleteMany({
    where: { id: { in: [E2E_JOB_FULLTIME_ID, E2E_JOB_INTERNSHIP_ID] } },
  });

  await prisma.recruiter.deleteMany({
    where: { id: E2E_RECRUITER_PROFILE_ID },
  });

  await prisma.company.deleteMany({
    where: { id: E2E_COMPANY_ID },
  });

  await prisma.student.deleteMany({
    where: { id: E2E_STUDENT_PROFILE_ID },
  });

  await prisma.user.deleteMany({
    where: {
      id: { in: [E2E_STUDENT_USER_ID, E2E_RECRUITER_USER_ID] },
    },
  });
}

export async function cleanE2EFixtures(): Promise<void> {
  assertSafeE2EDatabase(E2E_DATABASE_URL);
  const prisma = createE2EPrisma();
  try {
    await cleanE2EFixturesInternal(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
