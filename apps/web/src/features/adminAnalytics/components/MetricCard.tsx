import React from 'react';
import { LucideIcon } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface MetricCardProps {
  title: string;
  value: number;
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  description?: string;
  className?: string;
  iconClassName?: string;
  testId?: string;
}

/**
 * Presentational card component for an individual platform metric.
 * Adheres to CareerForge Admin Console visual conventions.
 * Preserves numeric 0 without converting to falsy/empty states.
 */
export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  icon: Icon,
  description,
  className,
  iconClassName,
  testId,
}) => {
  const formattedValue =
    typeof value === 'number' && !Number.isNaN(value)
      ? value.toLocaleString()
      : '0';

  return (
    <Card
      glass
      className={cn(
        'relative overflow-hidden transition-all duration-200 hover:border-border/80',
        className
      )}
      data-testid={testId || 'admin-metric-card'}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon && (
          <div
            className={cn(
              'h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0',
              iconClassName
            )}
            aria-hidden="true"
          >
            <Icon className="h-4.5 w-4.5" />
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div
          className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground"
          data-testid={`${testId || 'admin-metric-card'}-value`}
        >
          {formattedValue}
        </div>
        {description && (
          <CardDescription className="text-xs text-muted-foreground mt-1">
            {description}
          </CardDescription>
        )}
      </CardContent>
    </Card>
  );
};
