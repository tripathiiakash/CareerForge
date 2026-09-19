import { test, expect, type Page } from '@playwright/test';
import {
  TEST_STUDENT_EMAIL,
  TEST_STUDENT_PASSWORD,
  E2E_JOB_FULLTIME_ID,
} from './helpers/e2e-db';

async function loginStudent(
  page: Page,
  email = TEST_STUDENT_EMAIL,
  password = TEST_STUDENT_PASSWORD
) {
  await page.goto('/login');
  await page.getByLabel(/email address/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.locator('form').getByRole('button', { name: /sign in/i }).click();
}

test.describe('Student Full Journey E2E Test Suite (Phase 6.6-H)', () => {
  test.describe.configure({ mode: 'serial' });

  test('1. Protected Route: unauthenticated visitor is redirected to /login', async ({
    page,
  }) => {
    // Attempt visiting protected student dashboard without session
    await page.goto('/student/dashboard');

    // Should be redirected to /login
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();

    // Attempt visiting protected student profile without session
    await page.goto('/student/profile');
    await expect(page).toHaveURL(/\/login/);
  });

  test('2. Negative Authentication: invalid credentials display error and block entry', async ({
    page,
  }) => {
    await loginStudent(page, TEST_STUDENT_EMAIL, 'WrongPassword999!');

    // Expect server error alert banner
    const errorBanner = page.locator('role=alert');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText(/invalid/i);

    // Verify user remains on login page
    await expect(page).toHaveURL(/\/login/);
  });

  test('3. Student Authentication: valid credentials log in and establish secure cookie session', async ({
    page,
  }) => {
    await loginStudent(page);

    // Redirection to student dashboard
    await expect(page).toHaveURL(/\/student\/dashboard/);

    // Verify authenticated portal layout elements
    await expect(page.getByText('Student Portal')).toBeVisible();
    await expect(page.getByText(TEST_STUDENT_EMAIL).first()).toBeVisible();

    // Critical Security Contract (SEC-01): JWT is NOT stored in localStorage
    const localToken = await page.evaluate(() =>
      localStorage.getItem('careerforge_token')
    );
    expect(localToken).toBeNull();

    // User metadata is cached
    const localUser = await page.evaluate(() =>
      localStorage.getItem('careerforge_user')
    );
    expect(localUser).toContain(TEST_STUDENT_EMAIL);
  });

  test('4. Session Persistence: reload keeps authenticated session via HttpOnly cookie', async ({
    page,
  }) => {
    // Login to establish session
    await loginStudent(page);
    await expect(page).toHaveURL(/\/student\/dashboard/);

    // Reload page
    await page.reload();

    // Session must persist without redirecting to login
    await expect(page).toHaveURL(/\/student\/dashboard/);
    await expect(page.getByText('Student Portal')).toBeVisible();
    await expect(page.getByText(TEST_STUDENT_EMAIL).first()).toBeVisible();
  });

  test('5. Student Profile: renders existing data, edits and persists updates to DB', async ({
    page,
  }) => {
    await loginStudent(page);
    await expect(page).toHaveURL(/\/student\/dashboard/);

    // Navigate to Profile
    await page.goto('/student/profile');
    await expect(page.getByRole('heading', { name: /alex taylor/i })).toBeVisible();
    await expect(page.getByText('Stanford University')).toBeVisible();

    // Click Edit Profile
    await page.getByRole('button', { name: /edit profile/i }).click();

    // Update University field
    const uniInput = page.getByLabel(/university \/ college/i);
    await uniInput.fill('Massachusetts Institute of Technology');

    // Click Save Profile
    await page.getByRole('button', { name: /save profile/i }).click();

    // Verify success banner appears
    await expect(
      page.getByText(/profile updated successfully/i)
    ).toBeVisible();

    // Reload and verify persistence
    await page.reload();
    await expect(
      page.getByText('Massachusetts Institute of Technology')
    ).toBeVisible();
  });

  test('6. Job Board: displays active jobs and filters by employment type', async ({
    page,
  }) => {
    await loginStudent(page);
    await expect(page).toHaveURL(/\/student\/dashboard/);

    // Navigate to Job Board
    await page.goto('/student/jobs');
    await expect(
      page.getByRole('heading', { name: /active job board/i })
    ).toBeVisible();

    // Both jobs should be present initially
    await expect(
      page.getByText('Senior Full-Stack Engineer')
    ).toBeVisible();
    await expect(
      page.getByText('Frontend Engineering Intern')
    ).toBeVisible();

    // Click "Internship" filter button
    await page.getByRole('button', { name: 'Internship', exact: true }).click();

    // Intern job should remain visible, Full-time should be hidden
    await expect(
      page.getByText('Frontend Engineering Intern')
    ).toBeVisible();
    await expect(
      page.getByText('Senior Full-Stack Engineer')
    ).not.toBeVisible();

    // Click Reset Filters
    await page.getByRole('button', { name: /reset/i }).click();

    // Both jobs visible again
    await expect(
      page.getByText('Senior Full-Stack Engineer')
    ).toBeVisible();
    await expect(
      page.getByText('Frontend Engineering Intern')
    ).toBeVisible();
  });

  test('7. Job Details & Application Submission: submits application with primary resume', async ({
    page,
  }) => {
    await loginStudent(page);
    await expect(page).toHaveURL(/\/student\/dashboard/);

    // Navigate directly to Job Details for Senior Full-Stack Engineer
    await page.goto(`/student/jobs/${E2E_JOB_FULLTIME_ID}`);

    // Verify role information
    await expect(
      page.getByRole('heading', { name: 'Senior Full-Stack Engineer' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Apex Cloud Solutions' })
    ).toBeVisible();

    // Verify Application CTA
    await expect(
      page.getByRole('heading', { name: /apply for this position/i })
    ).toBeVisible();
    await expect(page.getByText(/will submit with your primary resume/i)).toBeVisible();

    // Click Apply Now
    const applyButton = page.getByRole('button', { name: /apply now/i });
    await expect(applyButton).toBeEnabled();
    await applyButton.click();

    // Confirmation must appear
    await expect(
      page.getByRole('heading', { name: /application submitted/i }).first()
    ).toBeVisible();

    // Reload page to verify persistence in DB
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Application Submitted', exact: true })
    ).toBeVisible();
  });

  test('8. Negative Application: duplicate application is prevented', async ({
    page,
  }) => {
    await loginStudent(page);
    await expect(page).toHaveURL(/\/student\/dashboard/);

    // Navigate to the already-applied job
    await page.goto(`/student/jobs/${E2E_JOB_FULLTIME_ID}`);

    // Verify "Apply Now" button is replaced with disabled "Applied" state
    await expect(
      page.getByRole('heading', { name: 'Application Submitted', exact: true })
    ).toBeVisible();
    const appliedButton = page.getByRole('button', { name: 'Applied', exact: true });
    await expect(appliedButton).toBeVisible();
    await expect(appliedButton).toBeDisabled();
  });

  test('9. Logout & Session Invalidation: sign out clears cookies and revokes portal access', async ({
    page,
  }) => {
    await loginStudent(page);
    await expect(page).toHaveURL(/\/student\/dashboard/);

    // Click Sign Out
    await page.getByRole('button', { name: /sign out/i }).click();

    // Should redirect to /login
    await expect(page).toHaveURL(/\/login/);

    // Attempt to access student portal after logout
    await page.goto('/student/dashboard');

    // Must be redirected back to /login
    await expect(page).toHaveURL(/\/login/);
  });
});
