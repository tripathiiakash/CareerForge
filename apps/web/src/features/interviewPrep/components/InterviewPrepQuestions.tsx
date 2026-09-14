import React from 'react';
import { Sparkles, RefreshCw, HelpCircle, CheckCircle2 } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { InterviewPrepData } from '../types';

export interface InterviewPrepQuestionsProps {
  data: InterviewPrepData;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  className?: string;
}

/**
 * Renders the 5 AI-generated interview questions in an accessible numbered format.
 * Adheres strictly to docs/API.md §5.6.
 */
export const InterviewPrepQuestions: React.FC<InterviewPrepQuestionsProps> = ({
  data,
  onRegenerate,
  isRegenerating = false,
  className,
}) => {
  const { job_title, questions } = data;

  return (
    <Card
      glass
      className={cn('border-primary/20 shadow-md', className)}
      data-testid="interview-prep-questions"
    >
      <CardHeader className="border-b border-border/40 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Badge
                variant="info"
                className="gap-1 px-2 py-0.5 text-xs font-semibold"
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                AI Tailored
              </Badge>
              <span className="text-xs text-muted-foreground">
                5 Core Questions
              </span>
            </div>
            <CardTitle
              className="text-xl font-bold text-foreground"
              data-testid="interview-prep-job-title"
            >
              {job_title || 'Interview Preparation'}
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              High-signal interview questions crafted based on required job
              skills and your candidate background.
            </CardDescription>
          </div>

          {onRegenerate && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              isLoading={isRegenerating}
              className="gap-1.5 text-xs self-start sm:self-auto shrink-0"
              data-testid="interview-prep-regenerate-button"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Regenerate</span>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        <ol
          className="space-y-4 list-none m-0 p-0"
          aria-label="Interview questions"
          data-testid="interview-prep-questions-list"
        >
          {questions.map((question, index) => (
            <li
              key={index}
              className="group p-4 rounded-xl bg-card/60 border border-border/60 hover:border-border transition-all flex items-start gap-4"
              data-testid={`interview-prep-question-item-${index + 1}`}
            >
              <div
                className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-mono text-xs font-bold shrink-0 mt-0.5 border border-primary/20"
                aria-hidden="true"
              >
                {String(index + 1).padStart(2, '0')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground font-medium leading-relaxed">
                  {question}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>

      <CardFooter className="border-t border-border/40 pt-4 pb-4 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <HelpCircle
            className="h-3.5 w-3.5 text-muted-foreground shrink-0"
            aria-hidden="true"
          />
          <span>
            Prepare structured responses using the STAR method for behavioral
            topics.
          </span>
        </div>
        <span className="text-[11px] font-mono opacity-80">
          Max 3 calls/day
        </span>
      </CardFooter>
    </Card>
  );
};
