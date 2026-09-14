import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface AdminMetricsErrorStateProps {
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

const DEFAULT_ERROR_MESSAGE =
  'Unable to retrieve platform metrics. Please check your network connection and try again.';

const TECHNICAL_ERROR_PATTERNS = [
  /prisma/i,
  /select\s+/i,
  /insert\s+/i,
  /database/i,
  /postgres/i,
  /econnrefused/i,
  /internal\s+server\s+error/i,
  /stack\s+trace/i,
  /syntaxerror/i,
  /typeerror/i,
  /uncaught/i,
  /column/i,
  /relation/i,
  /table/i,
  /500/i,
  /jwt/i,
  /bearer/i,
];

/**
 * Sanitizes error messages to protect against leaking internal infrastructure,
 * database details, or provider trace information to administrators.
 */
export function sanitizeAdminMetricsError(rawMessage?: string): string {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return DEFAULT_ERROR_MESSAGE;
  }

  const trimmed = rawMessage.trim();
  if (!trimmed) {
    return DEFAULT_ERROR_MESSAGE;
  }

  const hasTechnicalLeakage = TECHNICAL_ERROR_PATTERNS.some((pattern) =>
    pattern.test(trimmed)
  );

  if (hasTechnicalLeakage) {
    return DEFAULT_ERROR_MESSAGE;
  }

  return trimmed;
}

/**
 * User-friendly error state card when platform analytics cannot be retrieved.
 * Adheres to CareerForge Admin Console error display patterns.
 */
export const AdminMetricsErrorState: React.FC<AdminMetricsErrorStateProps> = ({
  message,
  onRetry,
  isRetrying = false,
  className,
}) => {
  const displayMessage = sanitizeAdminMetricsError(message);

  return (
    <Card
      glass
      className={cn('border-destructive/40 text-center py-12 px-6', className)}
      data-testid="admin-metrics-error-state"
    >
      <CardContent className="max-w-md mx-auto space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-destructive/15 text-destructive flex items-center justify-center mx-auto border border-destructive/20">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>

        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-foreground">
            Failed to Load Platform Metrics
          </h3>
          <p
            className="text-sm text-muted-foreground leading-relaxed"
            data-testid="admin-metrics-error-message"
          >
            {displayMessage}
          </p>
        </div>

        {onRetry && (
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              isLoading={isRetrying}
              className="gap-1.5 text-xs hover:border-destructive/60"
              data-testid="admin-metrics-retry-button"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Retry</span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
