import React, { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Briefcase,
  Users,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { useJobDetail } from '@/features/recruiterJobs';
import { useJobApplicants, useUpdateApplicationStatus } from './hooks';
import {
  ApplicantCard,
  ApplicantEmptyState,
  ApplicantErrorState,
  ApplicantFilters,
  ApplicantListSkeleton,
  RejectApplicantDialog,
} from './components';
import { ApplicantStatus, JobApplicant } from './types';
import { isValidUuid } from './recruiterApplicantsApi';
import { extractApiError } from '@/lib/api';

export const RecruiterApplicantsPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Validate jobId format
  const isJobIdValid = Boolean(jobId && isValidUuid(jobId));
  const validJobId = isJobIdValid ? (jobId as string) : '';

  // Parse filters & pagination from URL query string
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const currentPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

  const statusParam = searchParams.get('status');
  const currentStatus: ApplicantStatus | undefined =
    statusParam === 'APPLIED' ||
    statusParam === 'SHORTLISTED' ||
    statusParam === 'REJECTED'
      ? statusParam
      : undefined;

  // Query hooks
  const {
    data: job,
    isLoading: isLoadingJob,
    isError: isErrorJob,
    error: jobError,
  } = useJobDetail(validJobId);

  const {
    data: applicantsData,
    isLoading: isLoadingApplicants,
    isFetching: isFetchingApplicants,
    isError: isErrorApplicants,
    error: applicantsError,
    refetch: refetchApplicants,
  } = useJobApplicants(validJobId, {
    page: currentPage,
    limit: 10,
    status: currentStatus,
  });

  const updateMutation = useUpdateApplicationStatus(validJobId);

  // Mutation and feedback states
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingAction, setUpdatingAction] = useState<
    'SHORTLISTED' | 'REJECTED' | null
  >(null);
  const [applicantToReject, setApplicantToReject] =
    useState<JobApplicant | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filter change handler
  const handleStatusChange = (status?: ApplicantStatus) => {
    const nextParams = new URLSearchParams(searchParams);
    if (status) {
      nextParams.set('status', status);
    } else {
      nextParams.delete('status');
    }
    nextParams.delete('page'); // Reset to page 1 on filter change
    setSearchParams(nextParams);
  };

  // Pagination handler
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

  // Action handlers
  const handleShortlist = async (applicant: JobApplicant) => {
    setErrorMessage(null);
    setUpdatingId(applicant.application_id);
    setUpdatingAction('SHORTLISTED');

    try {
      await updateMutation.mutateAsync({
        applicationId: applicant.application_id,
        status: 'SHORTLISTED',
      });
      const name =
        `${applicant.student.first_name || ''} ${applicant.student.last_name || ''}`.trim() ||
        'Candidate';
      setSuccessBanner(`"${name}" has been shortlisted.`);
      toast.success(
        'Applicant shortlisted',
        `"${name}" has been moved to shortlisted.`
      );
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err: unknown) {
      const parsed = extractApiError(err);
      const msg = parsed.message || 'Failed to shortlist applicant.';
      setErrorMessage(msg);
      toast.error('Shortlist failed', msg);
    } finally {
      setUpdatingId(null);
      setUpdatingAction(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!applicantToReject) return;
    setErrorMessage(null);
    setUpdatingId(applicantToReject.application_id);
    setUpdatingAction('REJECTED');

    try {
      await updateMutation.mutateAsync({
        applicationId: applicantToReject.application_id,
        status: 'REJECTED',
      });
      const name =
        `${applicantToReject.student.first_name || ''} ${applicantToReject.student.last_name || ''}`.trim() ||
        'Candidate';
      setSuccessBanner(`"${name}" has been marked as rejected.`);
      toast.info(
        'Applicant rejected',
        `"${name}" has been marked as rejected.`
      );
      setApplicantToReject(null);
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err: unknown) {
      const parsed = extractApiError(err);
      const msg = parsed.message || 'Failed to reject applicant.';
      setErrorMessage(msg);
      toast.error('Rejection failed', msg);
    } finally {
      setUpdatingId(null);
      setUpdatingAction(null);
    }
  };

  // Case 1: Invalid Job ID in URL
  if (!isJobIdValid) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Link
          to="/recruiter/jobs"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Job Openings</span>
        </Link>
        <Card glass className="border-destructive/40 text-center py-12 px-6">
          <CardContent className="max-w-md mx-auto space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-destructive/15 text-destructive flex items-center justify-center mx-auto border border-destructive/20">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-foreground">
                Invalid Job Requisition
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The job identifier provided in the URL is malformed or invalid.
              </p>
            </div>
            <div className="pt-2">
              <Link to="/recruiter/jobs">
                <Button variant="outline" size="sm" className="text-xs">
                  Return to Jobs
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Case 2: Parent Job Error (e.g. Forbidden or Not Found)
  if (isErrorJob) {
    const parsedJobError = extractApiError(jobError);
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Link
          to="/recruiter/jobs"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Job Openings</span>
        </Link>
        <Card glass className="border-destructive/40 text-center py-12 px-6">
          <CardContent className="max-w-md mx-auto space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-destructive/15 text-destructive flex items-center justify-center mx-auto border border-destructive/20">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-foreground">
                Job Not Found or Access Denied
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {parsedJobError.message ||
                  'We could not load this job requisition. You may not have ownership rights to view its applicants.'}
              </p>
            </div>
            <div className="pt-2">
              <Link to="/recruiter/jobs">
                <Button variant="outline" size="sm" className="text-xs">
                  Return to Jobs
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const applicants = applicantsData?.data || [];
  const meta = applicantsData?.meta || {
    total: 0,
    page: currentPage,
    limit: 10,
    totalPages: 0,
  };

  const getJobStatusBadge = (status?: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <Badge variant="success" className="gap-1 items-center text-xs">
            <CheckCircle2 className="h-3 w-3" />
            <span>Active Post</span>
          </Badge>
        );
      case 'REJECTED':
        return (
          <Badge variant="destructive" className="gap-1 items-center text-xs">
            <AlertCircle className="h-3 w-3" />
            <span>Rejected</span>
          </Badge>
        );
      case 'PENDING':
      default:
        return (
          <Badge variant="warning" className="gap-1 items-center text-xs">
            <Clock className="h-3 w-3" />
            <span>Pending Review</span>
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          to="/recruiter/jobs"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to Job Openings</span>
        </Link>
      </div>

      {/* Recruiter-Friendly Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-medium text-foreground">
              {job?.company?.name || 'Organization Requisition'}
            </span>
            {job?.employment_type && (
              <>
                <span>•</span>
                <span>
                  {job.employment_type === 'FULL_TIME'
                    ? 'Full-Time'
                    : 'Internship'}
                </span>
              </>
            )}
            {job?.status && (
              <span className="ml-1">{getJobStatusBadge(job.status)}</span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Users className="h-6 w-6 sm:h-7 sm:w-7 text-emerald-400" />
            <span>{job?.title || 'Job Applicants'}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Evaluate candidate qualifications, inspect uploaded PDF resumes, and
            manage candidate pipeline statuses.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isFetchingApplicants && !isLoadingApplicants && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
              <span>Refreshing...</span>
            </span>
          )}
          <Badge variant="info" className="text-xs font-semibold py-1 px-3">
            {meta.total} Applicant{meta.total === 1 ? '' : 's'}
          </Badge>
        </div>
      </div>

      {/* Feedback Banners */}
      {successBanner && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm animate-fade-in">
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
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm animate-fade-in">
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

      {/* Applicant Filters */}
      <ApplicantFilters
        currentStatus={currentStatus}
        onChange={handleStatusChange}
        totalResults={meta.total}
      />

      {/* Main Content Area */}
      {isLoadingApplicants ? (
        <ApplicantListSkeleton count={3} />
      ) : isErrorApplicants ? (
        <ApplicantErrorState
          message={
            extractApiError(applicantsError).message ||
            'Unable to load applicants for this job requisition.'
          }
          onRetry={() => refetchApplicants()}
          isRetrying={isFetchingApplicants}
        />
      ) : applicants.length === 0 ? (
        <ApplicantEmptyState
          statusFilter={currentStatus}
          onClearFilter={() => handleStatusChange(undefined)}
        />
      ) : (
        <div className="space-y-4">
          {applicants.map((applicant) => (
            <ApplicantCard
              key={applicant.application_id}
              applicant={applicant}
              onShortlist={handleShortlist}
              onReject={setApplicantToReject}
              isUpdating={updatingId === applicant.application_id}
              updatingAction={
                updatingId === applicant.application_id ? updatingAction : null
              }
            />
          ))}

          {/* Pagination Controls */}
          {meta.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border/40">
              <div className="text-xs text-muted-foreground">
                Showing Page <span className="font-semibold">{meta.page}</span>{' '}
                of <span className="font-semibold">{meta.totalPages}</span> (
                {meta.total} total applicants)
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(meta.page - 1)}
                  disabled={meta.page <= 1 || isFetchingApplicants}
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
                  disabled={
                    meta.page >= meta.totalPages || isFetchingApplicants
                  }
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

      {/* Reject Confirmation Dialog */}
      <RejectApplicantDialog
        applicant={applicantToReject}
        isOpen={Boolean(applicantToReject)}
        isRejecting={Boolean(
          updatingId === applicantToReject?.application_id &&
          updatingAction === 'REJECTED'
        )}
        onConfirm={handleRejectConfirm}
        onCancel={() => setApplicantToReject(null)}
      />
    </div>
  );
};
