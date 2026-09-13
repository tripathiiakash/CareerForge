import React from 'react';
import { Users, Filter, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ApplicantStatus } from '../types';

export interface ApplicantEmptyStateProps {
  statusFilter?: ApplicantStatus;
  onClearFilter?: () => void;
}

export const ApplicantEmptyState: React.FC<ApplicantEmptyStateProps> = ({
  statusFilter,
  onClearFilter,
}) => {
  const hasFilter = Boolean(statusFilter);

  return (
    <Card glass className="border-border/60 text-center py-12 px-6">
      <CardContent className="max-w-md mx-auto space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-secondary/40 text-muted-foreground flex items-center justify-center mx-auto border border-border/40">
          {hasFilter ? (
            <Filter className="h-6 w-6 text-emerald-400" />
          ) : (
            <Users className="h-6 w-6 text-emerald-400" />
          )}
        </div>

        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-foreground">
            {hasFilter
              ? `No applicants marked as "${statusFilter?.toLowerCase()}"`
              : 'No applicants yet'}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {hasFilter
              ? 'No candidate submissions currently match this status filter. You can view all applicants by resetting the filter.'
              : 'When students apply for this job requisition, their profiles, qualifications, and attached PDF resumes will be listed here.'}
          </p>
        </div>

        {hasFilter && onClearFilter && (
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClearFilter}
              className="gap-1.5 text-xs hover:border-emerald-500/60"
            >
              <X className="h-3.5 w-3.5" />
              <span>Clear Filter</span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
