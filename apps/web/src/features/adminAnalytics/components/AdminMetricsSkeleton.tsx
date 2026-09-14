import React from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface AdminMetricsSkeletonProps {
  count?: number;
  className?: string;
}

/**
 * Loading skeleton placeholder for Admin Analytics metrics grid.
 * Mirrors the 5-card layout without rendering simulated or fake numbers.
 */
export const AdminMetricsSkeleton: React.FC<AdminMetricsSkeletonProps> = ({
  count = 5,
  className,
}) => {
  return (
    <div
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4',
        className
      )}
      role="status"
      aria-label="Loading platform metrics"
      data-testid="admin-metrics-skeleton"
    >
      {Array.from({ length: count }).map((_, index) => (
        <Card
          glass
          key={index}
          className="border-border/60 relative overflow-hidden"
          data-testid="admin-metric-card-skeleton"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            {/* Title Skeleton */}
            <div className="h-4 w-24 bg-secondary/60 rounded animate-pulse" />
            {/* Icon Skeleton */}
            <div className="h-9 w-9 rounded-lg bg-secondary/50 animate-pulse shrink-0" />
          </CardHeader>
          <CardContent>
            {/* Metric Value Skeleton */}
            <div className="h-8 w-20 bg-secondary/70 rounded animate-pulse" />
            {/* Metric Description Skeleton */}
            <div className="h-3 w-32 bg-secondary/40 rounded animate-pulse mt-2.5" />
          </CardContent>
        </Card>
      ))}
      <span className="sr-only">Loading platform metrics...</span>
    </div>
  );
};
