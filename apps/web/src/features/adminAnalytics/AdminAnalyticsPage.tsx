import React from 'react';
import { BarChart3, RotateCcw, Loader2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAdminMetrics } from './hooks';
import {
  MetricsGrid,
  AdminMetricsSkeleton,
  AdminMetricsErrorState,
} from './components';

/**
 * Admin Analytics Dashboard Page.
 * Displays high-level platform metrics overview for administrators.
 * Adheres strictly to docs/API.md §9.5 and CareerForge Admin Console visual conventions.
 */
export const AdminAnalyticsPage: React.FC = () => {
  const {
    data: metricsData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useAdminMetrics();

  return (
    <div
      className="space-y-6 max-w-5xl mx-auto"
      data-testid="admin-analytics-page"
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <BarChart3 className="h-6 w-6 sm:h-7 sm:w-7 text-amber-500" />
              <span>System Analytics</span>
            </h1>
            <Badge variant="warning" className="text-xs font-medium">
              Platform Metrics
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            High-level platform metrics across users, postings, and application
            volumes.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {isFetching && !isLoading && (
            <span
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              data-testid="admin-metrics-refreshing-indicator"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
              <span>Refreshing...</span>
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5 text-xs hover:border-border/80"
            data-testid="admin-metrics-refresh-button"
          >
            <RotateCcw
              className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')}
            />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Background Refetch Error Notification */}
      {isError && metricsData && (
        <div
          role="alert"
          className="flex items-center justify-between p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm"
          data-testid="admin-metrics-background-error-banner"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Could not refresh platform metrics. Displaying previously loaded
              data.
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-destructive hover:text-destructive/80 text-xs h-7 px-2"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Initial Loading Skeleton */}
      {isLoading && !metricsData && <AdminMetricsSkeleton />}

      {/* Initial Error State */}
      {isError && !metricsData && (
        <AdminMetricsErrorState
          message={error?.message}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      )}

      {/* Successful Metrics Grid */}
      {metricsData && <MetricsGrid metrics={metricsData} />}
    </div>
  );
};
