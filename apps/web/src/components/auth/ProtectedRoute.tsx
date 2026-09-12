import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { UserRole } from '@careerforge/types';
import { useAuth } from '@/auth/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

/**
 * Validates that a redirect path is internal and does not present open-redirect vulnerabilities.
 */
export function isSafeRedirectPath(path: string | undefined): boolean {
  if (!path || typeof path !== 'string') return false;
  // Must start with exactly one forward slash, not '//' or '/\'
  return (
    path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\')
  );
}

/**
 * Resolves the primary default portal landing page for a given role.
 */
export function getRoleDefaultPath(role: UserRole | null): string {
  switch (role) {
    case 'STUDENT':
      return '/student/jobs';
    case 'RECRUITER':
      return '/recruiter/dashboard';
    case 'ADMIN':
      return '/admin/moderation';
    default:
      return '/login';
  }
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  allowedRoles,
}) => {
  const { isAuthenticated, isLoading, role } = useAuth();
  const location = useLocation();

  // Avoid flashing protected content or redirects during session rehydration
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground font-medium">
          Verifying credentials...
        </span>
      </div>
    );
  }

  // Not logged in -> redirect to login with safe from state
  if (!isAuthenticated) {
    const safeFrom = isSafeRedirectPath(location.pathname)
      ? `${location.pathname}${location.search}`
      : undefined;

    return <Navigate to="/login" replace state={{ from: safeFrom }} />;
  }

  // Logged in, but does not match role requirements -> redirect to appropriate portal
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to={getRoleDefaultPath(role)} replace />;
  }

  return <Outlet />;
};
