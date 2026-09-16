import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  PlusCircle,
  AlertCircle,
  Loader2,
  CheckCircle2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useDeleteJob, useRecruiterJobs } from './hooks';
import { RecruiterJobCard } from './components/RecruiterJobCard';
import { DeleteJobDialog } from './components/DeleteJobDialog';
import { RecruiterJobItem } from './types';
import { extractApiError } from '@/lib/api';

export const RecruiterJobsPage: React.FC = () => {
  const { data: jobs, isLoading, isError, refetch } = useRecruiterJobs();
  const deleteMutation = useDeleteJob();

  const [jobToDelete, setJobToDelete] = useState<RecruiterJobItem | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDeleteConfirm = async () => {
    if (!jobToDelete) return;
    setErrorMessage(null);

    try {
      await deleteMutation.mutateAsync(jobToDelete.id);
      setSuccessBanner(`"${jobToDelete.title}" has been deleted.`);
      toast.success(
        'Job deleted',
        `"${jobToDelete.title}" has been deleted successfully.`
      );
      setJobToDelete(null);

      setTimeout(() => {
        setSuccessBanner(null);
      }, 4000);
    } catch (err: unknown) {
      const parsed = extractApiError(err);
      const msg = parsed.message || 'Failed to delete job posting.';
      setErrorMessage(msg);
      toast.error('Deletion failed', msg);
    }
  };

  if (isLoading) {
    return (
      <div
        data-testid="loading-state"
        className="min-h-[50vh] flex flex-col items-center justify-center gap-3"
      >
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        <span className="text-sm text-muted-foreground font-medium">
          Loading your job requisitions...
        </span>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        data-testid="error-state"
        className="p-6 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive space-y-3"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <h2 className="font-semibold text-lg">Unable to load job postings</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          An error occurred while fetching your job listings. Please try again.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Job Openings
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your open positions, track moderation status, and update role
            requirements.
          </p>
        </div>

        <Link to="/recruiter/jobs/new">
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-medium">
            <PlusCircle className="h-4 w-4" />
            <span>Post a Role</span>
          </Button>
        </Link>
      </div>

      {/* Notifications */}
      {successBanner && (
        <div
          data-testid="success-banner"
          className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 flex items-center justify-between shadow-sm animate-fade-in"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-400/80 hover:text-emerald-400"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          data-testid="error-banner"
          className="p-4 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive flex items-center justify-between shadow-sm animate-fade-in"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-destructive/80 hover:text-destructive"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Content */}
      {!jobs || jobs.length === 0 ? (
        /* Empty State */
        <div
          data-testid="empty-state"
          className="p-12 text-center border border-dashed border-border/70 rounded-2xl space-y-4 bg-secondary/10"
        >
          <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center">
            <Briefcase className="h-7 w-7" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-lg font-semibold text-foreground">
              No Job Openings Yet
            </h3>
            <p className="text-sm text-muted-foreground">
              You haven't posted any job requisitions yet. Post your first role
              to start receiving verified student applications.
            </p>
          </div>
          <div className="pt-2">
            <Link to="/recruiter/jobs/new">
              <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <PlusCircle className="h-4 w-4" />
                <span>Post Your First Role</span>
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        /* Job List */
        <div className="space-y-4" data-testid="jobs-list">
          {jobs.map((job) => (
            <RecruiterJobCard
              key={job.id}
              job={job}
              onDeleteClick={(selectedJob) => setJobToDelete(selectedJob)}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteJobDialog
        job={jobToDelete}
        isOpen={Boolean(jobToDelete)}
        isDeleting={deleteMutation.isPending}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setJobToDelete(null)}
      />
    </div>
  );
};
