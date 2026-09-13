import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface ApplicantErrorStateProps {
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export const ApplicantErrorState: React.FC<ApplicantErrorStateProps> = ({
  message = 'Unable to retrieve applicants for this job posting. Please try again.',
  onRetry,
  isRetrying = false,
}) => {
  return (
    <Card glass className="border-destructive/40 text-center py-12 px-6">
      <CardContent className="max-w-md mx-auto space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-destructive/15 text-destructive flex items-center justify-center mx-auto border border-destructive/20">
          <AlertCircle className="h-6 w-6" />
        </div>

        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-foreground">
            Failed to Load Applicants
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {message}
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
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
