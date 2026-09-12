import React from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApplicationStatus } from '../types';

export interface ApplicationFiltersProps {
  currentStatus: ApplicationStatus | '';
  onChange: (status: ApplicationStatus | '') => void;
  totalResults: number;
}

const STATUS_FILTER_OPTIONS: Array<{
  value: ApplicationStatus | '';
  label: string;
}> = [
  { value: '', label: 'All' },
  { value: 'APPLIED', label: 'Received' },
  { value: 'SHORTLISTED', label: 'Shortlisted' },
  { value: 'REJECTED', label: 'Not Selected' },
];

export const ApplicationFilters: React.FC<ApplicationFiltersProps> = ({
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
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_FILTER_OPTIONS.map((option) => {
          const isActive = currentStatus === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
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
            onClick={() => onChange('')}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <X className="h-3 w-3" />
            <span>Clear</span>
          </Button>
        )}
      </div>
    </div>
  );
};
