import React from 'react';
import {
  AlertCircle,
  Lock,
  AlertTriangle,
  RotateCcw,
  Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { extractApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface InterviewPrepErrorProps {
  error?: unknown;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

export interface MappedErrorDetails {
  title: string;
  message: string;
  isRateLimited: boolean;
  canRetry: boolean;
}

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
  /gemini/i,
  /openai/i,
];

/**
 * Maps raw API errors or error codes to customer-safe, friendly descriptions.
 * Never leaks database traces, provider exceptions, or infrastructure details.
 */
export function mapInterviewPrepError(error: unknown): MappedErrorDetails {
  const extracted = extractApiError(error);
  const code = extracted.code;
  const rawMessage = (extracted.message || '').trim();

  // 1. Rate limited (429)
  if (code === 'RATE_LIMITED' || rawMessage.toLowerCase().includes('max 3')) {
    return {
      title: 'Daily Limit Reached',
      message:
        'You have reached your limit of 3 interview preparation sessions for today. Please check back tomorrow (UTC) to generate new practice questions.',
      isRateLimited: true,
      canRetry: false,
    };
  }

  // 2. Validation error (400) - Unapplied or rejected application
  if (
    code === 'VALIDATION_ERROR' ||
    rawMessage.toLowerCase().includes('not applied') ||
    rawMessage.toLowerCase().includes('rejected')
  ) {
    return {
      title: 'Application Required',
      message:
        'AI Interview Preparation is only available for jobs where you have an active application in APPLIED or SHORTLISTED status.',
      isRateLimited: false,
      canRetry: false,
    };
  }

  // 3. Unauthorized (401)
  if (
    code === 'UNAUTHORIZED' ||
    rawMessage.toLowerCase().includes('unauthorized')
  ) {
    return {
      title: 'Sign In Required',
      message:
        'Your session has expired or you are not signed in. Please sign in with your student account to access interview preparation.',
      isRateLimited: false,
      canRetry: false,
    };
  }

  // 4. Job Not Found (404)
  if (code === 'NOT_FOUND' || rawMessage.toLowerCase().includes('not found')) {
    return {
      title: 'Job Unavailable',
      message:
        'This job posting is no longer active or could not be found. Interview preparation questions can only be generated for active listings.',
      isRateLimited: false,
      canRetry: false,
    };
  }

  // 5. Network disconnection
  if (code === 'NETWORK_ERROR') {
    return {
      title: 'Connection Issue',
      message:
        'Unable to connect to CareerForge. Please check your internet connection and try again.',
      isRateLimited: false,
      canRetry: true,
    };
  }

  // 6. Generic or Technical Error
  const hasLeakage = TECHNICAL_ERROR_PATTERNS.some((pattern) =>
    pattern.test(rawMessage)
  );

  const safeMessage =
    hasLeakage || !rawMessage
      ? 'We were unable to generate your interview questions at this time. Please try again in a few moments.'
      : rawMessage;

  return {
    title: 'Generation Failed',
    message: safeMessage,
    isRateLimited: false,
    canRetry: true,
  };
}

/**
 * Reusable error state component for AI Interview Preparation.
 * Adheres strictly to design tokens, contrast rules, and safe retry policies.
 */
export const InterviewPrepError: React.FC<InterviewPrepErrorProps> = ({
  error,
  onRetry,
  isRetrying = false,
  className,
}) => {
  const { title, message, isRateLimited, canRetry } =
    mapInterviewPrepError(error);

  const icon = isRateLimited ? (
    <Clock className="h-6 w-6" aria-hidden="true" />
  ) : canRetry ? (
    <AlertCircle className="h-6 w-6" aria-hidden="true" />
  ) : (
    <AlertTriangle className="h-6 w-6" aria-hidden="true" />
  );

  const iconContainerClass = isRateLimited
    ? 'bg-amber-500/15 text-amber-400 border-amber-500/25'
    : 'bg-destructive/15 text-destructive border-destructive/25';

  return (
    <Card
      glass
      className={cn('text-center py-10 px-6 border-border/80', className)}
      data-testid="interview-prep-error"
    >
      <CardContent className="max-w-md mx-auto space-y-4">
        <div
          className={cn(
            'h-12 w-12 rounded-2xl flex items-center justify-center mx-auto border',
            iconContainerClass
          )}
        >
          {icon}
        </div>

        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-foreground">{title}</h3>
          <p
            className="text-sm text-muted-foreground leading-relaxed"
            data-testid="interview-prep-error-message"
          >
            {message}
          </p>
        </div>

        {canRetry && onRetry && (
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              isLoading={isRetrying}
              className="gap-1.5 text-xs hover:border-primary/60"
              data-testid="interview-prep-retry-button"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Try Again</span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
