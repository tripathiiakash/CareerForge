import React from 'react';
import {
  GraduationCap,
  Building2,
  Briefcase,
  Clock,
  Send,
  LucideIcon,
} from 'lucide-react';
import { PlatformMetricsData } from '../types';
import { MetricCard } from './MetricCard';
import { cn } from '@/lib/utils';

export interface MetricConfig {
  key: keyof PlatformMetricsData;
  title: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
  testId: string;
}

export const ADMIN_METRIC_CONFIGS: readonly MetricConfig[] = [
  {
    key: 'total_students',
    title: 'Total Students',
    description: 'Registered student talent',
    icon: GraduationCap,
    iconClassName: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    testId: 'metric-card-total-students',
  },
  {
    key: 'total_recruiters',
    title: 'Total Recruiters',
    description: 'Verified employer partners',
    icon: Building2,
    iconClassName: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    testId: 'metric-card-total-recruiters',
  },
  {
    key: 'active_jobs',
    title: 'Active Jobs',
    description: 'Live approved job postings',
    icon: Briefcase,
    iconClassName: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    testId: 'metric-card-active-jobs',
  },
  {
    key: 'pending_jobs',
    title: 'Pending Jobs',
    description: 'Awaiting moderation review',
    icon: Clock,
    iconClassName: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    testId: 'metric-card-pending-jobs',
  },
  {
    key: 'total_applications',
    title: 'Total Applications',
    description: 'Candidate applications submitted',
    icon: Send,
    iconClassName: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    testId: 'metric-card-total-applications',
  },
];

export interface MetricsGridProps {
  metrics: PlatformMetricsData;
  className?: string;
}

/**
 * Responsive grid rendering the 5 platform analytics metrics.
 * Pure presentational component receiving metrics data via props.
 */
export const MetricsGrid: React.FC<MetricsGridProps> = ({
  metrics,
  className,
}) => {
  return (
    <div
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4',
        className
      )}
      data-testid="admin-metrics-grid"
    >
      {ADMIN_METRIC_CONFIGS.map((config) => {
        const rawValue = metrics[config.key];
        const value =
          typeof rawValue === 'number' && !Number.isNaN(rawValue)
            ? rawValue
            : 0;

        return (
          <MetricCard
            key={config.key}
            title={config.title}
            value={value}
            icon={config.icon}
            description={config.description}
            iconClassName={config.iconClassName}
            testId={config.testId}
          />
        );
      })}
    </div>
  );
};
