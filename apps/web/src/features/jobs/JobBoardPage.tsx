import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Briefcase,
  Compass,
  AlertCircle,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Inbox,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useJobs } from './hooks';
import { JobCard } from './components/JobCard';
import { JobFilters } from './components/JobFilters';
import { EmploymentType, JobFilterParams } from './types';

export const JobBoardPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse filters from URL search parameters
  const filters: JobFilterParams = useMemo(() => {
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const limitParam = parseInt(searchParams.get('limit') || '10', 10);
    const search = searchParams.get('search') || '';
    const skills = searchParams.get('skills') || '';
    const empType = searchParams.get('employment_type') || '';

    return {
      page: Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam,
      limit: Number.isNaN(limitParam) || limitParam < 1 ? 10 : limitParam,
      search,
      skills,
      employment_type:
        empType === 'INTERNSHIP' || empType === 'FULL_TIME'
          ? (empType as EmploymentType)
          : '',
    };
  }, [searchParams]);

  // Query jobs
  const { data, isLoading, isFetching, isError, error, refetch } =
    useJobs(filters);

  const jobs = data?.data || [];
  const meta = data?.meta || { total: 0, page: 1, limit: 10, totalPages: 0 };

  // Update URL search parameters
  const updateFilters = (updated: Partial<JobFilterParams>) => {
    const nextParams = new URLSearchParams(searchParams);

    const merged = { ...filters, ...updated };

    if (merged.page && merged.page > 1) {
      nextParams.set('page', merged.page.toString());
    } else {
      nextParams.delete('page');
    }

    if (merged.limit && merged.limit !== 10) {
      nextParams.set('limit', merged.limit.toString());
    } else {
      nextParams.delete('limit');
    }

    if (merged.search && merged.search.trim().length > 0) {
      nextParams.set('search', merged.search.trim());
    } else {
      nextParams.delete('search');
    }

    if (merged.skills && merged.skills.trim().length > 0) {
      nextParams.set('skills', merged.skills.trim());
    } else {
      nextParams.delete('skills');
    }

    if (merged.employment_type) {
      nextParams.set('employment_type', merged.employment_type);
    } else {
      nextParams.delete('employment_type');
    }

    setSearchParams(nextParams);
  };

  const handleResetFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const hasActiveFilters = Boolean(
    filters.search || filters.skills || filters.employment_type
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Compass className="h-7 w-7 text-primary" />
            <span>Active Job Board</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse verified opportunities curated for software engineers and
            technologists.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isFetching && !isLoading && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Updating...</span>
            </span>
          )}
          <Badge variant="info" className="text-xs">
            {meta.total} Active Role{meta.total === 1 ? '' : 's'}
          </Badge>
        </div>
      </div>

      {/* Filter Component */}
      <JobFilters
        filters={filters}
        onChange={updateFilters}
        onReset={handleResetFilters}
        totalResults={meta.total}
      />

      {/* Main Results / State Section */}
      {isLoading ? (
        // Loading Skeleton
        <div className="space-y-4">
          {[1, 2, 3, 4].map((n) => (
            <Card
              key={n}
              glass
              className="animate-pulse p-6 border border-border/50"
            >
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-secondary/80" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 bg-secondary/80 rounded" />
                  <div className="h-5 w-72 bg-secondary/80 rounded" />
                  <div className="flex gap-2 pt-2">
                    <div className="h-6 w-16 bg-secondary/60 rounded-full" />
                    <div className="h-6 w-20 bg-secondary/60 rounded-full" />
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : isError ? (
        // Error State
        <Card
          glass
          className="border-destructive/30 bg-destructive/5 text-center p-8"
        >
          <CardContent className="space-y-4 pt-2">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Unable to Load Job Listings
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
                {error?.message ||
                  'A network error occurred while communicating with the server.'}
              </p>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => refetch()}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Try Again</span>
            </Button>
          </CardContent>
        </Card>
      ) : jobs.length === 0 ? (
        // Empty State
        <Card glass className="text-center p-12 border-dashed border-border/80">
          <CardContent className="space-y-4 pt-4">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground mx-auto">
              <Inbox className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {hasActiveFilters
                  ? 'No Matches for Current Criteria'
                  : 'No Active Opportunities Currently Available'}
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
                {hasActiveFilters
                  ? 'Try broadening your search keyword, removing specific skills, or clearing employment filters.'
                  : 'Employers regularly post new roles. Please check back shortly.'}
              </p>
            </div>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Reset All Filters</span>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        // Job Listings List
        <div className="space-y-4">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}

          {/* Pagination Controls */}
          {meta.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-border/40">
              <p className="text-xs text-muted-foreground text-center sm:text-left">
                Showing{' '}
                <span className="font-semibold text-foreground">
                  {(meta.page - 1) * meta.limit + 1}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-foreground">
                  {Math.min(meta.page * meta.limit, meta.total)}
                </span>{' '}
                of{' '}
                <span className="font-semibold text-foreground">
                  {meta.total}
                </span>{' '}
                results
              </p>

              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={meta.page <= 1}
                  onClick={() => updateFilters({ page: meta.page - 1 })}
                  className="gap-1 text-xs"
                  aria-label="Previous Page"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Previous</span>
                </Button>

                <span className="text-xs font-medium px-3 py-1 bg-secondary/50 rounded-lg border border-border/40">
                  Page {meta.page} of {meta.totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => updateFilters({ page: meta.page + 1 })}
                  className="gap-1 text-xs"
                  aria-label="Next Page"
                >
                  <span>Next</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
