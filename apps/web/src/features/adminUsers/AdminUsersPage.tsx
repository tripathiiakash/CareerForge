import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { extractApiError } from '@/lib/api';
import { useAdminUsers, useDeleteUser } from './hooks';
import {
  AdminUserCard,
  UserFilters,
  DeleteUserDialog,
  AdminUserListSkeleton,
  AdminUserEmptyState,
  AdminUserErrorState,
  getUserDisplayName,
} from './components';
import { AdminUser, AdminUserFilterRole } from './types';

export const AdminUsersPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse page parameter from URL query string
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const currentPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

  // Parse role filter parameter from URL query string
  const roleParam = searchParams.get('role');
  const currentRole: AdminUserFilterRole | undefined =
    roleParam === 'STUDENT' || roleParam === 'RECRUITER'
      ? roleParam
      : undefined;

  // Parse search query parameter from URL query string
  const urlSearch = searchParams.get('search') || '';
  const [searchInput, setSearchInput] = useState(urlSearch);

  // Keep search input synchronized with URL param
  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  // Debounce search input changes to avoid spamming the backend API
  useEffect(() => {
    const handler = setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed !== urlSearch) {
        const nextParams = new URLSearchParams(searchParams);
        if (trimmed) {
          nextParams.set('search', trimmed);
        } else {
          nextParams.delete('search');
        }
        nextParams.delete('page'); // Reset to page 1 on search change
        setSearchParams(nextParams);
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [searchInput, urlSearch, searchParams, setSearchParams]);

  // Handle role tab filter change
  const handleRoleChange = (newRole: AdminUserFilterRole | undefined) => {
    const nextParams = new URLSearchParams(searchParams);
    if (newRole) {
      nextParams.set('role', newRole);
    } else {
      nextParams.delete('role');
    }
    nextParams.delete('page'); // Reset to page 1 on role filter change
    setSearchParams(nextParams);
  };

  // Handle search input change from controlled UserFilters
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
  };

  // Handle reset filters
  const handleResetFilters = () => {
    const nextParams = new URLSearchParams();
    setSearchParams(nextParams);
    setSearchInput('');
  };

  // Fetch users via React Query hook
  const {
    data: usersData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useAdminUsers({
    page: currentPage,
    limit: 20,
    role: currentRole,
    search: urlSearch || undefined,
  });

  const deleteMutation = useDeleteUser();

  // In-flight mutation, dialog, and banner states
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const users = usersData?.data || [];
  const meta = usersData?.meta || {
    total: 0,
    page: currentPage,
    limit: 20,
    totalPages: 0,
  };

  // Pagination navigation handler
  const handlePageChange = (newPage: number) => {
    const nextParams = new URLSearchParams(searchParams);
    if (newPage > 1) {
      nextParams.set('page', newPage.toString());
    } else {
      nextParams.delete('page');
    }
    setSearchParams(nextParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle case where deleting the last user on the last page leaves the page empty
  useEffect(() => {
    if (!isLoading && meta.totalPages > 0 && currentPage > meta.totalPages) {
      handlePageChange(meta.totalPages);
    }
  }, [isLoading, currentPage, meta.totalPages]);

  // Card action handler opening confirmation modal
  const handleDeleteClick = (user: AdminUser) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
    setErrorMessage(null);
  };

  // Modal confirmation execution
  const handleConfirmDelete = async () => {
    if (!selectedUser) return;

    setErrorMessage(null);
    setDeletingUserId(selectedUser.id);

    try {
      await deleteMutation.mutateAsync(selectedUser.id);

      const displayName = getUserDisplayName(selectedUser);
      setSuccessBanner(
        `User "${displayName}" (${selectedUser.email}) and associated data were permanently deleted.`
      );
      setSelectedUser(null);
      setIsDeleteDialogOpen(false);
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err: unknown) {
      const parsed = extractApiError(err);
      setErrorMessage(
        parsed.message || 'Failed to delete user account. Please try again.'
      );
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleCancelDelete = () => {
    if (deletingUserId) return;
    setSelectedUser(null);
    setIsDeleteDialogOpen(false);
  };

  const isFiltered = Boolean(currentRole || urlSearch.trim().length > 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <Users className="h-6 w-6 sm:h-7 sm:w-7 text-amber-500" />
              <span>User Management</span>
            </h1>
            <Badge variant="warning" className="text-xs font-medium">
              Admin Console
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage registered platform users, monitor account statuses, and
            perform administrative removals.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isFetching && !isLoading && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
              <span>Refreshing...</span>
            </span>
          )}
          <Badge
            variant="info"
            className="text-xs font-semibold py-1 px-3"
            data-testid="admin-users-count-badge"
          >
            {meta.total} Registered User{meta.total === 1 ? '' : 's'}
          </Badge>
        </div>
      </div>

      {/* Feedback Banners */}
      {successBanner && (
        <div
          role="alert"
          className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm animate-fade-in"
          data-testid="admin-users-success-banner"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-400/70 hover:text-emerald-400 p-1"
            aria-label="Dismiss success banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center justify-between p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm animate-fade-in"
          data-testid="admin-users-error-banner"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-destructive/70 hover:text-destructive p-1"
            aria-label="Dismiss error banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <UserFilters
        selectedRole={currentRole}
        search={searchInput}
        onRoleChange={handleRoleChange}
        onSearchChange={handleSearchChange}
      />

      {/* Main Content Area */}
      {isLoading ? (
        <AdminUserListSkeleton count={4} />
      ) : isError ? (
        <AdminUserErrorState
          message={error?.message}
          onRetry={() => refetch()}
        />
      ) : users.length === 0 ? (
        <AdminUserEmptyState
          isFiltered={isFiltered}
          onResetFilters={isFiltered ? handleResetFilters : undefined}
        />
      ) : (
        <div className="space-y-3" data-testid="admin-users-list">
          {users.map((user) => (
            <AdminUserCard
              key={user.id}
              user={user}
              onDelete={handleDeleteClick}
              isDeleting={deletingUserId === user.id}
            />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {!isLoading && !isError && meta.totalPages > 1 && (
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-border/50"
          data-testid="admin-users-pagination"
        >
          <p className="text-xs text-muted-foreground">
            Showing Page <span className="font-semibold">{meta.page}</span> of{' '}
            <span className="font-semibold">{meta.totalPages}</span> (
            <span className="font-semibold">{meta.total}</span> total user
            {meta.total === 1 ? '' : 's'})
          </p>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1 || isFetching}
              className="gap-1 text-xs"
              aria-label="Previous page"
              data-testid="admin-users-prev-page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= meta.totalPages || isFetching}
              className="gap-1 text-xs"
              aria-label="Next page"
              data-testid="admin-users-next-page"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Dialog */}
      <DeleteUserDialog
        user={selectedUser}
        isOpen={isDeleteDialogOpen}
        isDeleting={Boolean(deletingUserId)}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
};
