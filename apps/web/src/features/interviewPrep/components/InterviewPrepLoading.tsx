import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface InterviewPrepLoadingProps {
  jobTitle?: string;
  className?: string;
}

/**
 * Loading state component for AI Interview Preparation generation.
 * Features animated skeleton placeholders simulating the 5-question layout.
 */
export const InterviewPrepLoading: React.FC<InterviewPrepLoadingProps> = ({
  jobTitle,
  className,
}) => {
  return (
    <Card
      glass
      className={cn('border-primary/20 relative overflow-hidden', className)}
      role="status"
      aria-label="Generating interview questions"
      data-testid="interview-prep-loading"
    >
      <CardHeader className="space-y-2 border-b border-border/40 pb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Generating Interview Preparation
              </h3>
              <p className="text-xs text-muted-foreground">
                {jobTitle
                  ? `Tailoring questions for "${jobTitle}"...`
                  : 'Analyzing job requirements and your profile skills...'}
              </p>
            </div>
          </div>
          <span className="text-xs font-medium text-primary flex items-center gap-1 bg-primary/10 px-2.5 py-1 rounded-full">
            <Sparkles className="h-3 w-3 animate-pulse" aria-hidden="true" />
            AI Generating
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-4">
        {/* 5 placeholder skeleton questions */}
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="flex items-start gap-3.5 p-4 rounded-lg bg-secondary/30 border border-border/30 animate-pulse"
            data-testid="interview-prep-question-skeleton"
          >
            <div className="h-6 w-6 rounded-full bg-secondary/80 shrink-0 mt-0.5" />
            <div className="space-y-2 flex-1">
              <div className="h-4 bg-secondary/70 rounded w-11/12" />
              <div className="h-3.5 bg-secondary/50 rounded w-4/5" />
            </div>
          </div>
        ))}
        <span className="sr-only">
          Generating tailored interview questions...
        </span>
      </CardContent>
    </Card>
  );
};
