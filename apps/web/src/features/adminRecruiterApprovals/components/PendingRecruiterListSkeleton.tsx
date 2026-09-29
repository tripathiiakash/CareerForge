import React from 'react';
import { Card } from '@/components/ui/card';

export const PendingRecruiterListSkeleton: React.FC<{ count?: number }> = ({
  count = 3,
}) => {
  return (
    <div
      className="space-y-4 animate-pulse"
      data-testid="pending-recruiters-skeleton"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <Card
          key={idx}
          className="p-5 border-border/60 bg-card/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div className="flex items-start gap-3.5 flex-1">
            <div className="h-11 w-11 rounded-xl bg-secondary/70 shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-5 w-44 rounded bg-secondary/70" />
              <div className="flex gap-3">
                <div className="h-3.5 w-24 rounded bg-secondary/50" />
                <div className="h-3.5 w-32 rounded bg-secondary/50" />
                <div className="h-3.5 w-28 rounded bg-secondary/50" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="h-8 w-16 rounded bg-secondary/60" />
            <div className="h-8 w-32 rounded bg-secondary/60" />
          </div>
        </Card>
      ))}
    </div>
  );
};
