import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export interface PendingJobEmptyStateProps {
  title?: string;
  description?: string;
}

export const PendingJobEmptyState: React.FC<PendingJobEmptyStateProps> = ({
  title = 'Moderation Queue Clear',
  description = 'There are currently no job postings awaiting administrative review. All submitted jobs have been processed.',
}) => {
  return (
    <Card
      glass
      className="border-border/60 text-center py-12 px-6"
      data-testid="pending-job-empty-state"
    >
      <CardContent className="max-w-md mx-auto space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
          <ShieldCheck className="h-6 w-6" />
        </div>

        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
