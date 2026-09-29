import React from 'react';
import { UserCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';

export const PendingRecruiterEmptyState: React.FC = () => {
  return (
    <Card
      className="p-12 text-center border-dashed border-border/70 bg-card/30 flex flex-col items-center justify-center space-y-3"
      data-testid="pending-recruiters-empty-state"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
        <UserCheck className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground tracking-tight">
          All Caught Up
        </h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          There are no pending recruiter verification requests. New recruiter
          sign-ups awaiting administrative approval will appear here.
        </p>
      </div>
    </Card>
  );
};
