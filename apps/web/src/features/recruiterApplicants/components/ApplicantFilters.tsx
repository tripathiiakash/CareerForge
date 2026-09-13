import React from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApplicantStatus } from '../types';

export interface ApplicantFiltersProps {
  currentStatus?: ApplicantStatus;
  onChange: (status?: ApplicantStatus) => void;
  totalResults?: number;
}

const STATUS_FILTER_OPTIONS: Array<{
  value?: ApplicantStatus;
  label: string;
}> = [
  { value: undefined, label: 'All' },
  { value: 'APPLIED', label: 'Applied' },
  { value: 'SHORTLISTED', label: 'Shortlisted' },
  { value: 'REJECTED', label: 'Rejected' },
];

export const ApplicantFilters: React.FC<ApplicantFiltersProps> = ({
  currentStatus,
  onChange,
  totalResults,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-secondary/20 border border-border/40 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Filter by Status:
        </span>
        {typeof totalResults === 'number' && (
          <span className="text-xs text-muted-foreground font-medium">
            ({totalResults})
          </span>
        )}
      </div>

      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Filter applicants by status"
      >
        {STATUS_FILTER_OPTIONS.map((option) => {
          const isActive = currentStatus === option.value;
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={isActive}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                  : 'bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/70'
              }`}
            >
              {option.label}
            </button>
          );
        })}

        {currentStatus && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(undefined)}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
            aria-label="Clear status filter"
          >
            <X className="h-3 w-3" />
            <span>Clear</span>
          </Button>
        )}
      </div>
    </div>
  );
};
