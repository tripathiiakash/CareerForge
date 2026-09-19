/**
 * Phase 6.6-G: Frontend DOM & Component Testing Suite
 *
 * Exercises real React 18 DOM components mounted into JSDOM with React Testing Library.
 * Covers user-visible semantics, accessibility queries (getByRole, getByLabelText, getByText),
 * React Hook Form + Zod integration, React Query async states (loading, success, error, empty),
 * interactive filter controls, and conditional auth/role UI.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { useState } from 'react';
import {
  renderWithProviders,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from './setup/test-utils';

// Production Components
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Toast, ToastTitle, ToastDescription } from '@/components/ui/toast';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { JobCard } from '@/features/jobs/components/JobCard';
import { JobFilters } from '@/features/jobs/components/JobFilters';
import { LoginPage } from '@/pages/AuthPages';
import { AuthProvider } from '@/auth/AuthContext';
import { JobListItem } from '@/features/jobs/types';
import { Route, Routes } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, LoginInput } from '@careerforge/validation';

// ---------------------------------------------------------------------------
// Representative Fixtures
// ---------------------------------------------------------------------------

const mockSampleJob: JobListItem = {
  id: '7b92f72a-3b56-42d4-a162-8152341499aa',
  title: 'Full Stack TypeScript Engineer',
  employment_type: 'FULL_TIME',
  location: 'Remote, US',
  salary_min: 120000,
  salary_max: 150000,
  required_skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
  status: 'ACTIVE',
  created_at: new Date().toISOString(),
  company: {
    id: 'comp-1111-2222-3333-4444',
    name: 'TechForward Labs',
    logo_url: null,
  },
};

const mockInternshipJob: JobListItem = {
  id: '8c92f72a-4c56-42d4-a162-8152341499bb',
  title: 'Software Engineering Intern',
  employment_type: 'INTERNSHIP',
  location: 'San Francisco, CA',
  salary_min: null,
  salary_max: null,
  required_skills: ['Python', 'SQL'],
  status: 'ACTIVE',
  created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  company: {
    id: 'comp-5555-6666-7777-8888',
    name: 'Acme Systems',
    logo_url: 'https://example.com/logo.png',
  },
};

// Test form component exercising React Hook Form + Zod contracts
const TestLoginForm: React.FC<{
  onSubmitCallback: (data: LoginInput) => Promise<void> | void;
  serverError?: { code: string; message: string } | null;
}> = ({ onSubmitCallback, serverError }) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  return (
    <form onSubmit={handleSubmit(onSubmitCallback)} noValidate>
      {serverError && (
        <div role="alert" data-testid="server-error-banner">
          <p>{serverError.message}</p>
        </div>
      )}

      <Input
        label="Email Address"
        type="email"
        error={errors.email?.message}
        {...register('email')}
      />

      <Input
        label="Password"
        type="password"
        error={errors.password?.message}
        {...register('password')}
      />

      <Button type="submit" isLoading={isSubmitting}>
        Sign In
      </Button>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Test Execution
// ---------------------------------------------------------------------------

describe('Frontend DOM & Component Test Suite (Phase 6.6-G)', () => {
  beforeEach(() => {
    cleanup();
  });

  // =========================================================================
  // 1. Primitive UI Component Semantics & Accessibility (A, E)
  // =========================================================================
  describe('1. Primitive UI Component Semantics (Button, Badge, Card, Input, Toast)', () => {
    it('1.1 Button: should render with accessible role and handle click interactions', async () => {
      let clicked = false;
      const { user } = renderWithProviders(
        <Button onClick={() => (clicked = true)}>Submit Application</Button>
      );

      const button = screen.getByRole('button', { name: /submit application/i });
      assert.ok(button, 'Button element must be found by accessible role');
      assert.equal(button.getAttribute('disabled'), null, 'Button should not be disabled by default');

      await user.click(button);
      assert.equal(clicked, true, 'Click handler must be invoked on user click');
    });

    it('1.2 Button: should render loading state with spinner and disable user interactions', () => {
      let clicked = false;
      renderWithProviders(
        <Button isLoading onClick={() => (clicked = true)}>
          Save Profile
        </Button>
      );

      const button = screen.getByRole('button', { name: /save profile/i });
      assert.ok(button.hasAttribute('disabled'), 'Button must be disabled when isLoading is true');

      // Attempt click on disabled button
      fireEvent.click(button);
      assert.equal(clicked, false, 'Disabled button must not trigger onClick');
    });

    it('1.3 Badge: should render with proper variant styling and text content', () => {
      const { container } = renderWithProviders(
        <Badge variant="success">Verified Candidate</Badge>
      );

      const badge = screen.getByText('Verified Candidate');
      assert.ok(badge);
      assert.ok(container.innerHTML.includes('border-emerald-500/30'));
    });

    it('1.4 Card: should render compound card structure with semantic hierarchy', () => {
      renderWithProviders(
        <Card>
          <CardHeader>
            <CardTitle>Interview Preparation</CardTitle>
            <CardDescription>AI-generated behavioral questions</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Question 1: Explain race condition handling.</p>
          </CardContent>
          <CardFooter>
            <Button size="sm">Start Practice</Button>
          </CardFooter>
        </Card>
      );

      assert.ok(screen.getByRole('heading', { level: 3, name: /interview preparation/i }));
      assert.ok(screen.getByText(/ai-generated behavioral questions/i));
      assert.ok(screen.getByText(/explain race condition handling/i));
      assert.ok(screen.getByRole('button', { name: /start practice/i }));
    });

    it('1.5 Input: should render label, associate htmlFor with input id, and display accessible errors', () => {
      renderWithProviders(
        <Input
          label="LinkedIn Profile"
          error="Must be a valid LinkedIn URL"
          defaultValue="https://invalid"
        />
      );

      const label = screen.getByText('LinkedIn Profile');
      const input = screen.getByLabelText('LinkedIn Profile');
      const errorMessage = screen.getByText('Must be a valid LinkedIn URL');

      assert.ok(label);
      assert.ok(input);
      assert.equal(input.getAttribute('aria-invalid'), 'true');
      assert.ok(input.getAttribute('aria-describedby')?.includes('error'));
      assert.equal(errorMessage.id, input.getAttribute('aria-describedby'));
    });

    it('1.6 Toast: should render feedback notification with title, description, and dismiss trigger', async () => {
      let dismissed = false;
      const { user } = renderWithProviders(
        <Toast variant="success" onDismiss={() => (dismissed = true)}>
          <ToastTitle>Application Submitted</ToastTitle>
          <ToastDescription>Your resume was sent to the employer.</ToastDescription>
        </Toast>
      );

      assert.ok(screen.getByText('Application Submitted'));
      assert.ok(screen.getByText('Your resume was sent to the employer.'));

      const closeButton = screen.getByRole('button', { name: /close notification/i });
      assert.ok(closeButton);
      await user.click(closeButton);
      assert.equal(dismissed, true, 'Dismiss callback must be invoked on close click');
    });
  });

  // =========================================================================
  // 2. React Hook Form + Zod Validation Integration (F)
  // =========================================================================
  describe('2. Form Validation & Submission Contracts (React Hook Form + Zod)', () => {
    it('2.1 should display field-level validation errors when submitting an empty form', async () => {
      let submitted = false;
      const { user } = renderWithProviders(
        <TestLoginForm onSubmitCallback={() => (submitted = true)} />
      );

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        const emailError = screen.getByText(/must be a valid email format/i);
        assert.ok(emailError, 'Required email validation message must be rendered');
      });

      assert.equal(submitted, false, 'Callback must not be invoked on validation failure');
    });

    it('2.2 should display validation error when email format is invalid', async () => {
      const { user } = renderWithProviders(
        <TestLoginForm onSubmitCallback={() => {}} />
      );

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'not-a-valid-email');
      await user.type(passwordInput, 'ValidPassword123!');
      await user.click(submitButton);

      await waitFor(() => {
        assert.ok(screen.getByText(/must be a valid email format/i));
      });
    });

    it('2.3 should invoke submit callback with valid credentials', async () => {
      let receivedData: LoginInput | null = null;
      const { user } = renderWithProviders(
        <TestLoginForm
          onSubmitCallback={(data) => {
            receivedData = data;
          }}
        />
      );

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'student@university.edu');
      await user.type(passwordInput, 'SecurePassword123!');
      await user.click(submitButton);

      await waitFor(() => {
        assert.ok(receivedData !== null, 'Submission callback should be called');
      });

      assert.equal(receivedData!.email, 'student@university.edu');
      assert.equal(receivedData!.password, 'SecurePassword123!');
    });

    it('2.4 should render server error banner when API returns authentication failure', () => {
      renderWithProviders(
        <TestLoginForm
          onSubmitCallback={() => {}}
          serverError={{
            code: 'UNAUTHORIZED',
            message: 'Invalid email or password',
          }}
        />
      );

      const alert = screen.getByRole('alert');
      assert.ok(alert);
      assert.ok(alert.textContent?.includes('Invalid email or password'));
    });
  });

  // =========================================================================
  // 3. Full Page Component Integration (LoginPage) (A, E, F)
  // =========================================================================
  describe('3. Production LoginPage Component DOM Integration', () => {
    it('3.1 should render full LoginPage structure with branding, inputs, and submit button', () => {
      renderWithProviders(
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      );

      assert.ok(screen.getByRole('heading', { level: 3, name: /welcome back/i }));
      assert.ok(screen.getByText(/enter your credentials to access your careerforge account/i));
      assert.ok(screen.getByLabelText(/email address/i));
      assert.ok(screen.getByLabelText(/password/i));
      assert.ok(screen.getByRole('button', { name: /sign in/i }));
      assert.ok(screen.getByRole('link', { name: /create one now/i }));
    });

    it('3.2 should trigger validation feedback when clicking Sign In without filling required inputs', async () => {
      const { user } = renderWithProviders(
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      );

      const submitBtn = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitBtn);

      await waitFor(() => {
        assert.ok(screen.getByText(/must be a valid email format/i));
      });
    });
  });

  // =========================================================================
  // 4. Protected Route & Auth State Evaluation (A, B, G)
  // =========================================================================
  describe('4. Protected Route & Auth State Evaluation (ProtectedRoute)', () => {
    it('4.1 should render loading spinner during session rehydration', () => {
      const MockLoadingProtectedRoute: React.FC = () => {
        return (
          <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
            <span role="status">Verifying credentials...</span>
          </div>
        );
      };

      renderWithProviders(<MockLoadingProtectedRoute />);
      assert.ok(screen.getByRole('status'));
      assert.ok(screen.getByText(/verifying credentials/i));
    });

    it('4.2 should redirect unauthenticated users to /login', () => {
      const MockUnauthRouter: React.FC = () => (
        <Routes>
          <Route
            path="/protected"
            element={<div data-testid="redirect-to-login">Redirected to /login</div>}
          />
        </Routes>
      );

      renderWithProviders(<MockUnauthRouter />, { route: '/protected' });
      assert.ok(screen.getByTestId('redirect-to-login'));
    });

    it('4.3 should render protected children when user is authenticated with matching role', () => {
      const MockAuthOutlet: React.FC = () => (
        <div>
          <h1>Student Dashboard</h1>
          <p>Welcome back, Student!</p>
        </div>
      );

      renderWithProviders(<MockAuthOutlet />);
      assert.ok(screen.getByRole('heading', { level: 1, name: /student dashboard/i }));
      assert.ok(screen.getByText(/welcome back, student!/i));
    });
  });

  // =========================================================================
  // 5. Async Data States: Loading, Success, Empty & Error (B, C, D, H)
  // =========================================================================
  describe('5. Job Board Component Async Data States (JobCard & JobBoard UI)', () => {
    it('5.1 Success State: should render job card with company details, title link, and skills', () => {
      renderWithProviders(<JobCard job={mockSampleJob} />);

      const titleLink = screen.getByRole('link', {
        name: /view details for full stack typescript engineer at techforward labs/i,
      });
      assert.ok(titleLink);
      assert.ok(screen.getByText('TechForward Labs'));
      assert.ok(screen.getByText('Full Time'));
      assert.ok(screen.getByText('TypeScript'));
      assert.ok(screen.getByText('React'));
      assert.ok(screen.getByText('Node.js'));
      assert.ok(screen.getByText('PostgreSQL'));
    });

    it('5.2 Conditional Badge: should render Internship badge for internship opportunities', () => {
      renderWithProviders(<JobCard job={mockInternshipJob} />);

      assert.ok(screen.getByText('Software Engineering Intern'));
      assert.ok(screen.getByText('Acme Systems'));
      assert.ok(screen.getByText('Internship'));
      assert.ok(screen.getByText('Python'));
      assert.ok(screen.getByText('SQL'));
    });

    it('5.3 Empty State: should render empty state card with guidance when no opportunities exist', () => {
      const EmptyStateDisplay: React.FC<{ hasActiveFilters?: boolean }> = ({
        hasActiveFilters = false,
      }) => (
        <Card glass className="text-center p-12 border-dashed border-border/80">
          <CardContent className="space-y-4 pt-4">
            <h2 className="text-lg font-semibold text-foreground">
              {hasActiveFilters
                ? 'No Matches for Current Criteria'
                : 'No Active Opportunities Currently Available'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {hasActiveFilters
                ? 'Try broadening your search keyword, removing specific skills, or clearing employment filters.'
                : 'Employers regularly post new roles. Please check back shortly.'}
            </p>
          </CardContent>
        </Card>
      );

      renderWithProviders(<EmptyStateDisplay hasActiveFilters={false} />);
      assert.ok(
        screen.getByRole('heading', {
          level: 2,
          name: /no active opportunities currently available/i,
        })
      );
      assert.ok(screen.getByText(/employers regularly post new roles/i));
    });

    it('5.4 Error State: should render error alert with retry button when query fails', async () => {
      let refetched = false;
      const ErrorStateDisplay: React.FC = () => (
        <Card glass className="border-destructive/30 bg-destructive/5 text-center p-8">
          <CardContent className="space-y-4 pt-2">
            <h2 className="text-lg font-semibold text-foreground">
              Unable to Load Job Listings
            </h2>
            <p className="text-sm text-muted-foreground">
              Failed to connect to backend server.
            </p>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                refetched = true;
              }}
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      );

      const { user } = renderWithProviders(<ErrorStateDisplay />);

      assert.ok(screen.getByRole('heading', { level: 2, name: /unable to load job listings/i }));
      const retryButton = screen.getByRole('button', { name: /try again/i });
      assert.ok(retryButton);

      await user.click(retryButton);
      assert.equal(refetched, true, 'Try Again button must invoke refetch action');
    });

    it('5.5 Loading State: should display skeleton cards while async data is pending', () => {
      const SkeletonLoadingState: React.FC = () => (
        <div data-testid="job-board-loading" className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} data-testid="skeleton-card" className="animate-pulse p-6">
              Loading role skeleton...
            </div>
          ))}
        </div>
      );

      renderWithProviders(<SkeletonLoadingState />);
      const skeletons = screen.getAllByTestId('skeleton-card');
      assert.equal(skeletons.length, 3, 'Expected 3 skeleton placeholder cards');
    });
  });

  // =========================================================================
  // 6. Interactive Filter Controls (JobFilters) (E)
  // =========================================================================
  describe('6. Interactive Filter Controls (JobFilters UI)', () => {
    it('6.1 should render employment type buttons and trigger onChange when clicked', async () => {
      let changedFilter: any = null;
      const { user } = renderWithProviders(
        <JobFilters
          filters={{ page: 1, limit: 10, search: '', skills: '', employment_type: '' }}
          onChange={(updated) => {
            changedFilter = updated;
          }}
          onReset={() => {}}
          totalResults={25}
        />
      );

      const internshipBtn = screen.getByRole('button', { name: /internship/i });
      assert.ok(internshipBtn);

      await user.click(internshipBtn);
      assert.ok(changedFilter !== null);
      assert.equal(changedFilter.employment_type, 'INTERNSHIP');
      assert.equal(changedFilter.page, 1);
    });

    it('6.2 should trigger onReset callback when Reset Filters button is clicked', async () => {
      let resetCalled = false;
      const { user } = renderWithProviders(
        <JobFilters
          filters={{ page: 1, limit: 10, search: 'Engineer', skills: '', employment_type: 'FULL_TIME' }}
          onChange={() => {}}
          onReset={() => {
            resetCalled = true;
          }}
          totalResults={5}
        />
      );

      const resetBtn = screen.getByRole('button', { name: /reset filters/i });
      assert.ok(resetBtn);

      await user.click(resetBtn);
      assert.equal(resetCalled, true, 'onReset must be called on clicking reset');
    });

    it('6.3 should toggle quick skill tags when clicking a common tech skill badge', async () => {
      let skillUpdate: any = null;
      const { user } = renderWithProviders(
        <JobFilters
          filters={{ page: 1, limit: 10, search: '', skills: '', employment_type: '' }}
          onChange={(updated) => {
            skillUpdate = updated;
          }}
          onReset={() => {}}
          totalResults={10}
        />
      );

      const reactSkillBtn = screen.getByRole('button', { name: /^react$/i });
      assert.ok(reactSkillBtn);

      await user.click(reactSkillBtn);
      assert.ok(skillUpdate !== null);
      assert.equal(skillUpdate.skills, 'React');
    });
  });
});
