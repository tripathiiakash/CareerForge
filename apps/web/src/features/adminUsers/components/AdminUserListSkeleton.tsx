import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

export interface AdminUserListSkeletonProps {
  count?: number;
}

export const AdminUserListSkeleton: React.FC<AdminUserListSkeletonProps> = ({
  count = 4,
}) => {
  return (
    <div
      className="space-y-3"
      role="status"
      aria-label="Loading users"
      data-testid="admin-user-list-skeleton"
    >
      {Array.from({ length: count }).map((_, index) => (
        <Card glass key={index} className="border-border/60">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Left Info Skeleton */}
              <div className="flex items-start gap-3.5 flex-1">
                <div className="h-10 w-10 rounded-xl bg-secondary/60 animate-pulse shrink-0 mt-0.5" />

                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-36 bg-secondary/60 rounded animate-pulse" />
                    <div className="h-5 w-16 bg-secondary/50 rounded-full animate-pulse" />
                    <div className="h-5 w-14 bg-secondary/50 rounded-full animate-pulse" />
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="h-3.5 w-44 bg-secondary/40 rounded animate-pulse" />
                    <div className="h-3.5 w-28 bg-secondary/40 rounded animate-pulse" />
                    <div className="h-3.5 w-24 bg-secondary/30 rounded animate-pulse" />
                  </div>
                </div>
              </div>

              {/* Action Button Skeleton */}
              <div className="flex items-center justify-end shrink-0">
                <div className="h-8 w-20 bg-secondary/50 rounded-md animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <span className="sr-only">Loading users...</span>
    </div>
  );
};
