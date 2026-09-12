import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { StudentLayout } from '@/layouts/StudentLayout';
import { RecruiterLayout } from '@/layouts/RecruiterLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LoginPage, RegisterPage } from '@/pages/AuthPages';
import {
  StudentJobsPage,
  StudentApplicationsPage,
  StudentResumePage,
  StudentProfilePage,
} from '@/pages/StudentPages';
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
        element: <StudentJobsPage />,
      },
      {
        path: 'features',
        element: <HomePage />,
      },
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

  // Student Portal routes
  {
    path: '/student',
    element: <StudentLayout />,
    errorElement: <NotFoundPage />,
    children: [
      {
        index: true,
        element: <Navigate to="/student/jobs" replace />,
      },
      {
        path: 'jobs',
        element: <StudentJobsPage />,
      },
      {
        path: 'applications',
        element: <StudentApplicationsPage />,
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

  // Recruiter Portal routes
  {
    path: '/recruiter',
    element: <RecruiterLayout />,
    errorElement: <NotFoundPage />,
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

  // Admin Console routes
  {
    path: '/admin',
    element: <AdminLayout />,
    errorElement: <NotFoundPage />,
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

  // Catch-all 404
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
