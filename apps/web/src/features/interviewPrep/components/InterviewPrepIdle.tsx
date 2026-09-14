import React from 'react';
import { Sparkles, HelpCircle, ShieldCheck } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface InterviewPrepIdleProps {
  jobTitle?: string;
  onGenerate: () => void;
  isPending?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Idle call-to-action state encouraging candidates to generate AI interview questions.
 * Clearly articulates the tailored nature and daily quota boundaries.
 */
export const InterviewPrepIdle: React.FC<InterviewPrepIdleProps> = ({
  jobTitle,
  onGenerate,
  isPending = false,
  disabled = false,
  className,
}) => {
  return (
    <Card
      glass
      className={cn(
        'border-border/80 text-center py-10 px-6 shadow-sm',
        className
      )}
      data-testid="interview-prep-idle"
    >
      <CardContent className="max-w-md mx-auto space-y-5">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto border border-primary/20 shadow-inner">
          <Sparkles className="h-7 w-7 text-primary" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Badge
              variant="outline"
              className="text-xs px-2.5 py-0.5 border-primary/30 text-primary font-medium"
            >
              AI Career Coach
            </Badge>
          </div>
          <h3 className="text-xl font-bold text-foreground">
            {jobTitle
              ? `Prepare for ${jobTitle}`
              : 'Tailored Interview Practice'}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Generate 5 tailored interview questions designed to test your core
            competencies, role problem-solving, and the intersection of your
            skills with this position.
          </p>
        </div>

        <div className="pt-2">
          <Button
            variant="default"
            size="lg"
            onClick={onGenerate}
            isLoading={isPending}
            disabled={disabled || isPending}
            className="w-full sm:w-auto gap-2 px-8"
            data-testid="interview-prep-generate-button"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>Generate Interview Questions</span>
          </Button>
        </div>

        <div className="pt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck
            className="h-3.5 w-3.5 text-primary/70 shrink-0"
            aria-hidden="true"
          />
          <span>
            Maximum 3 interview preparation sessions per student per day.
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
