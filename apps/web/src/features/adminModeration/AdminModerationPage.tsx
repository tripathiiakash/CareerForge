import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckSquare,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { extractApiError } from '@/lib/api';
import { usePendingJobs, useModerateJobStatus } from './hooks';
import {
  PendingJobCard,
  ModerationActionDialog,
  PendingJobListSkeleton,
  PendingJobEmptyState,
  PendingJobErrorState,
} from './components';
import { PendingJob, AdminModerationJobStatus } from './types';

export const AdminModerationPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse page parameter from URL query string
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const currentPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

  // Fetch pending jobs using React Query hook
  const {
    data: pendingJobsData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = usePendingJobs({
    page: currentPage,
    limit: 10,
  });

  const moderateMutation = useModerateJobStatus();

  // In-flight mutation and dialog tracking
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingAction, setUpdatingAction] =
    useState<AdminModerationJobStatus | null>(null);
  const [dialogJob, setDialogJob] = useState<PendingJob | null>(null);
  const [dialogAction, setDialogAction] =
    useState<AdminModerationJobStatus | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const jobs = pendingJobsData?.data || [];
  const meta = pendingJobsData?.meta || {
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
  const handleApproveClick = (job: PendingJob) => {
    setDialogJob(job);
    setDialogAction('ACTIVE');
  };

  const handleRejectClick = (job: PendingJob) => {
    setDialogJob(job);
    setDialogAction('REJECTED');
  };

  // Modal confirmation execution
  const handleConfirmModeration = async () => {
    if (!dialogJob || !dialogAction) return;

    setErrorMessage(null);
    setUpdatingId(dialogJob.id);
    setUpdatingAction(dialogAction);

    try {
      await moderateMutation.mutateAsync({
        jobId: dialogJob.id,
        status: dialogAction,
      });

      const actionLabel =
        dialogAction === 'ACTIVE' ? 'approved and published' : 'rejected';
      setSuccessBanner(`"${dialogJob.title}" was successfully ${actionLabel}.`);
      if (dialogAction === 'ACTIVE') {
        toast.success(
          'Job approved',
          `"${dialogJob.title}" was approved and published.`
        );
      } else {
        toast.info('Job rejected', `"${dialogJob.title}" was rejected.`);
      }
      setDialogJob(null);
      setDialogAction(null);
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err: unknown) {
      const parsed = extractApiError(err);
      const msg =
        parsed.message ||
        'Failed to complete moderation action. Please try again.';
      setErrorMessage(msg);
      toast.error('Moderation failed', msg);
    } finally {
      setUpdatingId(null);
      setUpdatingAction(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <CheckSquare className="h-6 w-6 sm:h-7 sm:w-7 text-amber-500" />
              <span>Job Moderation Queue</span>
            </h1>
            <Badge variant="warning" className="text-xs font-medium">
              Admin Clearance
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Review submitted job postings and approve or reject with
            administrative authority.
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
            data-testid="pending-jobs-count-badge"
          >
            {meta.total} Pending Posting{meta.total === 1 ? '' : 's'}
          </Badge>
        </div>
      </div>

      {/* Feedback Banners */}
      {successBanner && (
        <div
          role="alert"
          className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm animate-fade-in"
          data-testid="moderation-success-banner"
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
          data-testid="moderation-error-banner"
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
        <PendingJobListSkeleton count={3} />
      ) : isError ? (
        <PendingJobErrorState
          message={
            extractApiError(error).message ||
            'Unable to retrieve pending jobs for moderation.'
          }
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      ) : jobs.length === 0 ? (
        <PendingJobEmptyState />
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <PendingJobCard
              key={job.id}
              job={job}
              onApprove={handleApproveClick}
              onReject={handleRejectClick}
              isUpdating={updatingId === job.id}
              updatingAction={updatingId === job.id ? updatingAction : null}
            />
          ))}

          {/* Pagination Controls */}
          {meta.totalPages > 1 && (
            <div
              className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border/40"
              data-testid="moderation-pagination"
            >
              <div className="text-xs text-muted-foreground">
                Showing Page <span className="font-semibold">{meta.page}</span>{' '}
                of <span className="font-semibold">{meta.totalPages}</span> (
                {meta.total} total pending jobs)
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
      <ModerationActionDialog
        job={dialogJob}
        action={dialogAction}
        isOpen={Boolean(dialogJob && dialogAction)}
        isSubmitting={Boolean(updatingId === dialogJob?.id)}
        onConfirm={handleConfirmModeration}
        onCancel={() => {
          setDialogJob(null);
          setDialogAction(null);
        }}
      />
    </div>
  );
};
