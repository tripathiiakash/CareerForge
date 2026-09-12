import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { StudentLayout } from '@/layouts/StudentLayout';
import { RecruiterLayout } from '@/layouts/RecruiterLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LoginPage, RegisterPage } from '@/pages/AuthPages';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PublicOnlyRoute } from '@/components/auth/PublicOnlyRoute';
import {
  StudentJobsPage,
  StudentApplicationsPage,
  StudentResumePage,
} from '@/pages/StudentPages';
import { StudentDashboardPage } from '@/features/student/StudentDashboardPage';
import { StudentProfilePage } from '@/features/student/StudentProfilePage';
import { JobBoardPage } from '@/features/jobs/JobBoardPage';
import { JobDetailsPage } from '@/features/jobs/JobDetailsPage';
import { ApplicationsPage } from '@/features/applications/ApplicationsPage';
import {
  RecruiterDashboardPage,
  RecruiterJobsPage,
  RecruiterPostJobPage,
  RecruiterCompanyPage,
} from '@/pages/RecruiterPages';
import { AdminModerationPage, AdminAnalyticsPage } from '@/pages/AdminPages';

export const router = createBrowserRouter([
  // Public routes
  {
    path: '/',
    element: <PublicLayout />,
    errorElement: <NotFoundPage />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'jobs',
        element: <JobBoardPage />,
      },
      {
        path: 'features',
        element: <HomePage />,
      },
      // Public-only auth routes (redirects if already authenticated)
      {
        element: <PublicOnlyRoute />,
        children: [
          {
            path: 'login',
            element: <LoginPage />,
          },
          {
            path: 'register',
            element: <RegisterPage />,
          },
        ],
      },
    ],
  },

  // Protected Student Portal routes
  {
    path: '/student',
    element: <ProtectedRoute allowedRoles={['STUDENT']} />,
    errorElement: <NotFoundPage />,
    children: [
      {
        element: <StudentLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/student/dashboard" replace />,
          },
          {
            path: 'dashboard',
            element: <StudentDashboardPage />,
          },
          {
            path: 'jobs',
            element: <JobBoardPage />,
          },
          {
            path: 'jobs/:jobId',
            element: <JobDetailsPage />,
          },
          {
            path: 'applications',
            element: <ApplicationsPage />,
          },
          {
            path: 'resume',
            element: <StudentResumePage />,
          },
          {
            path: 'profile',
            element: <StudentProfilePage />,
          },
        ],
      },
    ],
  },

  // Protected Recruiter Portal routes
  {
    path: '/recruiter',
    element: <ProtectedRoute allowedRoles={['RECRUITER']} />,
    errorElement: <NotFoundPage />,
    children: [
      {
        element: <RecruiterLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/recruiter/dashboard" replace />,
          },
          {
            path: 'dashboard',
            element: <RecruiterDashboardPage />,
          },
          {
            path: 'jobs',
            element: <RecruiterJobsPage />,
          },
          {
            path: 'jobs/new',
            element: <RecruiterPostJobPage />,
          },
          {
            path: 'company',
            element: <RecruiterCompanyPage />,
          },
        ],
      },
    ],
  },

  // Protected Admin Console routes
  {
    path: '/admin',
    element: <ProtectedRoute allowedRoles={['ADMIN']} />,
    errorElement: <NotFoundPage />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/admin/moderation" replace />,
          },
          {
            path: 'moderation',
            element: <AdminModerationPage />,
          },
          {
            path: 'analytics',
            element: <AdminAnalyticsPage />,
          },
        ],
      },
    ],
  },

  // Catch-all 404
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
