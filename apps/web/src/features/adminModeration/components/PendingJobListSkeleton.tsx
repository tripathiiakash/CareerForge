import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

export interface PendingJobListSkeletonProps {
  count?: number;
}

export const PendingJobListSkeleton: React.FC<PendingJobListSkeletonProps> = ({
  count = 3,
}) => {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-label="Loading pending jobs"
      data-testid="pending-job-list-skeleton"
    >
      {Array.from({ length: count }).map((_, index) => (
        <Card glass key={index} className="border-border/60">
          <CardContent className="p-5 sm:p-6 space-y-4">
            {/* Header Skeleton */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-2 flex-1">
                <div className="h-6 w-48 bg-secondary/60 rounded animate-pulse" />
                <div className="h-4 w-32 bg-secondary/40 rounded animate-pulse" />
              </div>
              <div className="flex gap-2">
                <div className="h-6 w-20 bg-secondary/50 rounded-full animate-pulse" />
                <div className="h-6 w-28 bg-secondary/50 rounded-full animate-pulse" />
              </div>
            </div>

            {/* Recruiter Details Skeleton */}
            <div className="flex flex-wrap items-center gap-4 bg-secondary/30 px-3.5 py-2.5 rounded-lg border border-border/40">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-secondary/60 animate-pulse" />
                <div className="h-3.5 w-28 bg-secondary/50 rounded animate-pulse" />
              </div>
              <div className="h-3.5 w-36 bg-secondary/40 rounded animate-pulse" />
              <div className="h-3.5 w-24 bg-secondary/40 rounded animate-pulse ml-auto" />
            </div>

            {/* Skills Pills Skeleton */}
            <div className="space-y-1.5">
              <div className="h-3 w-20 bg-secondary/40 rounded animate-pulse" />
              <div className="flex flex-wrap gap-1.5">
                <div className="h-5 w-16 bg-secondary/50 rounded-full animate-pulse" />
                <div className="h-5 w-20 bg-secondary/50 rounded-full animate-pulse" />
                <div className="h-5 w-14 bg-secondary/50 rounded-full animate-pulse" />
              </div>
            </div>

            {/* Description Skeleton */}
            <div className="space-y-2">
              <div className="h-3.5 w-full bg-secondary/40 rounded animate-pulse" />
              <div className="h-3.5 w-3/4 bg-secondary/40 rounded animate-pulse" />
            </div>

            {/* Bottom Actions Skeleton */}
            <div className="flex items-center justify-between pt-3 border-t border-border/40">
              <div className="h-3.5 w-44 bg-secondary/30 rounded animate-pulse" />
              <div className="flex gap-2.5">
                <div className="h-8 w-20 bg-secondary/60 rounded-md animate-pulse" />
                <div className="h-8 w-18 bg-secondary/60 rounded-md animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <span className="sr-only">Loading pending jobs...</span>
    </div>
  );
};
