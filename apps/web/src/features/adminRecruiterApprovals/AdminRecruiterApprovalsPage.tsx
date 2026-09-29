import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { extractApiError } from '@/lib/api';
import {
  usePendingRecruiters,
  useApproveRecruiter,
  useRejectRecruiter,
} from './hooks';
import {
  PendingRecruiterCard,
  RecruiterApprovalDialog,
  PendingRecruiterListSkeleton,
  PendingRecruiterEmptyState,
  PendingRecruiterErrorState,
} from './components';
import { PendingRecruiter } from './types';

export const AdminRecruiterApprovalsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse page parameter from URL query string
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const currentPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

  // Fetch pending recruiters using React Query hook
  const {
    data: pendingRecruitersData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = usePendingRecruiters({
    page: currentPage,
    limit: 10,
  });

  const approveMutation = useApproveRecruiter();
  const rejectMutation = useRejectRecruiter();

  // In-flight mutation and dialog tracking
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingAction, setUpdatingAction] = useState<
    'APPROVE' | 'REJECT' | null
  >(null);
  const [dialogRecruiter, setDialogRecruiter] =
    useState<PendingRecruiter | null>(null);
  const [dialogAction, setDialogAction] = useState<'APPROVE' | 'REJECT' | null>(
    null
  );
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recruiters = pendingRecruitersData?.data || [];
  const meta = pendingRecruitersData?.meta || {
    total: 0,
    page: currentPage,
    limit: 10,
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

  // Handle case where moderating the last item on a page leaves the page empty
  useEffect(() => {
    if (!isLoading && meta.totalPages > 0 && currentPage > meta.totalPages) {
      handlePageChange(meta.totalPages);
    }
  }, [isLoading, currentPage, meta.totalPages]);

  // Card action handlers opening confirmation modal
  const handleApproveClick = (recruiter: PendingRecruiter) => {
    setDialogRecruiter(recruiter);
    setDialogAction('APPROVE');
  };

  const handleRejectClick = (recruiter: PendingRecruiter) => {
    setDialogRecruiter(recruiter);
    setDialogAction('REJECT');
  };

  // Modal confirmation execution
  const handleConfirmModeration = async () => {
    if (!dialogRecruiter || !dialogAction) return;

    const recruiterId = dialogRecruiter.id;
    const recruiterName =
      `${dialogRecruiter.first_name} ${dialogRecruiter.last_name}`.trim();
    const action = dialogAction;

    setUpdatingId(recruiterId);
    setUpdatingAction(action);
    setErrorMessage(null);
    setSuccessBanner(null);

    // Close dialog immediately to reflect state
    setDialogRecruiter(null);
    setDialogAction(null);

    try {
      if (action === 'APPROVE') {
        const result = await approveMutation.mutateAsync(recruiterId);
        const msg = `${recruiterName} has been approved successfully.`;
        setSuccessBanner(msg);
        toast({
          title: 'Recruiter Approved',
          description: result.message || msg,
          variant: 'success',
        });
      } else {
        const result = await rejectMutation.mutateAsync(recruiterId);
        const msg = `Recruiter verification for ${recruiterName} was rejected.`;
        setSuccessBanner(msg);
        toast({
          title: 'Recruiter Rejected',
          description: result.message || msg,
          variant: 'default',
        });
      }
    } catch (err: unknown) {
      const apiErr = extractApiError(err);
      const failMsg =
        apiErr.message || `Failed to process recruiter verification.`;
      setErrorMessage(failMsg);
      toast({
        title: 'Operation Failed',
        description: failMsg,
        variant: 'destructive',
      });
    } finally {
      setUpdatingId(null);
      setUpdatingAction(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Moderation Hub Navigation Pill Tabs */}
      <div className="flex items-center gap-2 border-b border-border/40 pb-4">
        <Link
          to="/admin/moderation"
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
        >
          <CheckSquare className="h-4 w-4" />
          <span>Job Postings</span>
        </Link>
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-secondary text-amber-400 shadow-sm">
          <UserCheck className="h-4 w-4" />
          <span>Recruiter Approvals</span>
          {meta.total > 0 && (
            <Badge variant="warning" className="ml-1 px-1.5 py-0 text-[10px]">
              {meta.total}
            </Badge>
          )}
        </div>
      </div>

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Recruiter Approvals
            </h1>
            <Badge variant="warning" className="gap-1 text-xs">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Admin Moderation</span>
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Review and verify company recruiter accounts before granting job
            posting permissions.
          </p>
        </div>

        {meta.total > 0 && (
          <div className="text-xs text-muted-foreground bg-secondary/50 px-3 py-1.5 rounded-lg border border-border/50 self-start sm:self-auto">
            <span className="font-semibold text-foreground">{meta.total}</span>{' '}
            recruiter{meta.total === 1 ? '' : 's'} awaiting approval
          </div>
        )}
      </div>

      {/* Success Notification Banner */}
      {successBanner && (
        <div
          className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm animate-fade-in"
          data-testid="recruiter-approval-success-banner"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-400/70 hover:text-emerald-400 p-1"
            aria-label="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Error Notification Banner */}
      {errorMessage && (
        <div
          className="flex items-center justify-between p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm animate-fade-in"
          data-testid="recruiter-approval-error-banner"
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

      {/* Main Content Area */}
      {isLoading ? (
        <PendingRecruiterListSkeleton count={3} />
      ) : isError ? (
        <PendingRecruiterErrorState
          message={
            extractApiError(error).message ||
            'Unable to retrieve pending recruiters for verification.'
          }
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      ) : recruiters.length === 0 ? (
        <PendingRecruiterEmptyState />
      ) : (
        <div className="space-y-4">
          {recruiters.map((recruiter) => (
            <PendingRecruiterCard
              key={recruiter.id}
              recruiter={recruiter}
              onApprove={handleApproveClick}
              onReject={handleRejectClick}
              isUpdating={updatingId === recruiter.id}
              updatingAction={
                updatingId === recruiter.id ? updatingAction : null
              }
            />
          ))}

          {/* Pagination Controls */}
          {meta.totalPages > 1 && (
            <div
              className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border/40"
              data-testid="recruiter-approvals-pagination"
            >
              <div className="text-xs text-muted-foreground">
                Showing Page <span className="font-semibold">{meta.page}</span>{' '}
                of <span className="font-semibold">{meta.totalPages}</span> (
                {meta.total} total pending recruiters)
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(meta.page - 1)}
                  disabled={meta.page <= 1 || isFetching}
                  className="h-8 gap-1 text-xs"
                  aria-label="Go to previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Previous</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(meta.page + 1)}
                  disabled={meta.page >= meta.totalPages || isFetching}
                  className="h-8 gap-1 text-xs"
                  aria-label="Go to next page"
                >
                  <span>Next</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Dialog */}
      <RecruiterApprovalDialog
        recruiter={dialogRecruiter}
        action={dialogAction}
        isOpen={Boolean(dialogRecruiter && dialogAction)}
        isSubmitting={Boolean(updatingId === dialogRecruiter?.id)}
        onConfirm={handleConfirmModeration}
        onCancel={() => {
          setDialogRecruiter(null);
          setDialogAction(null);
        }}
      />
    </div>
  );
};
