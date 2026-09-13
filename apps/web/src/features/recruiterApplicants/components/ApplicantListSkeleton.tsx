import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

export interface ApplicantListSkeletonProps {
  count?: number;
}

export const ApplicantListSkeleton: React.FC<ApplicantListSkeletonProps> = ({
  count = 3,
}) => {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-label="Loading candidate applicants"
      data-testid="applicant-list-skeleton"
    >
      {Array.from({ length: count }).map((_, index) => (
        <Card glass key={index} className="border-border/60">
          <CardContent className="p-5 sm:p-6 space-y-4">
            {/* Header Skeleton */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-secondary/60 animate-pulse shrink-0" />
                <div className="space-y-2">
                  <div className="h-5 w-40 bg-secondary/60 rounded animate-pulse" />
                  <div className="h-3.5 w-24 bg-secondary/40 rounded animate-pulse" />
                </div>
              </div>
              <div className="h-6 w-20 bg-secondary/60 rounded-full animate-pulse" />
            </div>

            {/* Education Summary Skeleton */}
            <div className="h-8 w-full max-w-md bg-secondary/40 rounded-lg animate-pulse" />

            {/* Skills Pills Skeleton */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <div className="h-5 w-16 bg-secondary/50 rounded-full animate-pulse" />
              <div className="h-5 w-20 bg-secondary/50 rounded-full animate-pulse" />
              <div className="h-5 w-14 bg-secondary/50 rounded-full animate-pulse" />
            </div>

            {/* Bottom Actions Skeleton */}
            <div className="flex items-center justify-between pt-3 border-t border-border/40">
              <div className="h-4 w-28 bg-secondary/50 rounded animate-pulse" />
              <div className="flex gap-2">
                <div className="h-8 w-20 bg-secondary/60 rounded-md animate-pulse" />
                <div className="h-8 w-16 bg-secondary/60 rounded-md animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <span className="sr-only">Loading applicants...</span>
    </div>
  );
};
