import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { getRoleDefaultPath } from './ProtectedRoute';
import { Loader2 } from 'lucide-react';

export const PublicOnlyRoute: React.FC = () => {
  const { isAuthenticated, isLoading, role } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground font-medium">
          Loading session...
        </span>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={getRoleDefaultPath(role)} replace />;
  }

  return <Outlet />;
};
