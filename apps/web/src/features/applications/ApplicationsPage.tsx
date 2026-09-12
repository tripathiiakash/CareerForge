import React, { useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Send,
  AlertCircle,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Inbox,
  Briefcase,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useStudentApplications } from './hooks';
import { ApplicationCard } from './components/ApplicationCard';
import { ApplicationFilters } from './components/ApplicationFilters';
import { ApplicationFilterParams, ApplicationStatus } from './types';

export const ApplicationsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse filters from URL query string
  const filters: ApplicationFilterParams = useMemo(() => {
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const statusParam = searchParams.get('status') || '';

    const validStatus: ApplicationStatus | '' =
      statusParam === 'APPLIED' ||
      statusParam === 'SHORTLISTED' ||
      statusParam === 'REJECTED'
        ? statusParam
        : '';

    return {
      page: Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam,
      limit: 10,
      status: validStatus,
    };
  }, [searchParams]);

  const { data, isLoading, isFetching, isError, error, refetch } =
    useStudentApplications(filters);

  const applications = data?.data || [];
  const meta = data?.meta || { total: 0, page: 1, limit: 10, totalPages: 0 };

  const handleStatusChange = (status: ApplicationStatus | '') => {
    const nextParams = new URLSearchParams(searchParams);
    if (status) {
      nextParams.set('status', status);
    } else {
      nextParams.delete('status');
    }
    // Always reset to page 1 on filter change
    nextParams.delete('page');
    setSearchParams(nextParams);
  };

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

  const hasStatusFilter = Boolean(filters.status);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Send className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
            <span>My Applications</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track real-time statuses and recruiter reviews for your job
            submissions.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isFetching && !isLoading && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Updating...</span>
            </span>
          )}
          <Badge variant="info" className="text-xs font-semibold py-1 px-3">
            {meta.total} Application{meta.total === 1 ? '' : 's'}
          </Badge>
        </div>
      </div>

      {/* Status Filter Bar */}
      <ApplicationFilters
        currentStatus={filters.status || ''}
        onChange={handleStatusChange}
        totalResults={meta.total}
      />

      {/* Main Content States */}
      {isLoading ? (
        // Loading Skeleton
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <Card key={n} glass className="p-6 animate-pulse space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-1/4 bg-secondary/80 rounded" />
                  <div className="h-6 w-1/2 bg-secondary/60 rounded" />
                  <div className="h-3 w-1/3 bg-secondary/40 rounded" />
                </div>
                <div className="h-8 w-24 bg-secondary/60 rounded-full" />
              </div>
            </Card>
          ))}
        </div>
      ) : isError ? (
        // Error State
        <Card glass className="text-center p-12 border-destructive/30">
          <CardContent className="space-y-4 pt-4">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Failed to Load Applications
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
                {error?.message ||
                  'An unexpected network error occurred while retrieving your applications.'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-2 mx-auto"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Try Again</span>
            </Button>
          </CardContent>
        </Card>
      ) : applications.length === 0 ? (
        // Empty State
        <Card glass className="text-center p-12">
          <CardContent className="space-y-4 pt-4">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/60 text-muted-foreground mx-auto">
              <Inbox className="h-7 w-7" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-foreground">
                {hasStatusFilter
                  ? 'No Applications Match this Filter'
                  : 'No Applications Yet'}
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
                {hasStatusFilter
                  ? `You have no applications with status "${filters.status}". Try selecting another filter.`
                  : "You haven't submitted any job applications yet. Browse the active job board to find verified roles matching your skills."}
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              {hasStatusFilter ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusChange('')}
                >
                  Clear Status Filter
                </Button>
              ) : (
                <Link to="/student/jobs">
                  <Button size="sm" className="gap-2">
                    <Briefcase className="h-4 w-4" />
                    <span>Explore Active Jobs</span>
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        // Applications List
        <div className="space-y-4">
          {applications.map((application) => (
            <ApplicationCard
              key={application.application_id}
              application={application}
            />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {meta.totalPages > 1 && !isLoading && !isError && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border/40">
          <span className="text-xs text-muted-foreground order-2 sm:order-1">
            Showing {(meta.page - 1) * meta.limit + 1} to{' '}
            {Math.min(meta.page * meta.limit, meta.total)} of {meta.total}{' '}
            applications
          </span>

          <div className="flex items-center gap-2 order-1 sm:order-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(meta.page - 1)}
              disabled={meta.page <= 1 || isFetching}
              className="gap-1 h-8 px-2.5 text-xs"
              aria-label="Previous Page"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Previous</span>
            </Button>

            <span className="text-xs px-2 font-medium text-foreground">
              Page {meta.page} of {meta.totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(meta.page + 1)}
              disabled={meta.page >= meta.totalPages || isFetching}
              className="gap-1 h-8 px-2.5 text-xs"
              aria-label="Next Page"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
