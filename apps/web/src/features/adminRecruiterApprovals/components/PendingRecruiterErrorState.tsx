import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface PendingRecruiterErrorStateProps {
  message: string;
  onRetry: () => void;
  isRetrying?: boolean;
}

export const PendingRecruiterErrorState: React.FC<
  PendingRecruiterErrorStateProps
> = ({ message, onRetry, isRetrying = false }) => {
  return (
    <Card
      className="p-8 text-center border-destructive/30 bg-destructive/5 space-y-4"
      data-testid="pending-recruiters-error-state"
    >
      <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-destructive/15 text-destructive border border-destructive/25">
        <AlertCircle className="h-6 w-6" />
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-destructive">
          Failed to Load Pending Recruiters
        </h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          {message}
        </p>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        disabled={isRetrying}
        className="gap-2 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`}
        />
        <span>Retry</span>
      </Button>
    </Card>
  );
};
