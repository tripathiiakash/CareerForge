import React, { useState } from 'react';
import {
  Building2,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Mail,
  User,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PendingJob, AdminModerationJobStatus } from '../types';

export function formatJobDate(dateString?: string | null): string {
  if (!dateString) return 'Recently';
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Recently';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Recently';
  }
}

export function formatEmploymentType(type?: string | null): string {
  if (!type) return 'Not Specified';
  switch (type.toUpperCase()) {
    case 'FULL_TIME':
      return 'Full-time';
    case 'INTERNSHIP':
      return 'Internship';
    default:
      return type.replace(/_/g, ' ');
  }
}

export interface PendingJobCardProps {
  job: PendingJob;
  onApprove?: (job: PendingJob) => void;
  onReject?: (job: PendingJob) => void;
  isUpdating?: boolean;
  updatingAction?: AdminModerationJobStatus | null;
}

export const PendingJobCard: React.FC<PendingJobCardProps> = ({
  job,
  onApprove,
  onReject,
  isUpdating = false,
  updatingAction = null,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const recruiterFullName =
    `${job.recruiter?.first_name || ''} ${job.recruiter?.last_name || ''}`.trim() ||
    'Recruiter';
  const companyName = job.company?.name || 'Company';
  const formattedDate = formatJobDate(job.created_at);
  const formattedEmployment = formatEmploymentType(job.employment_type);

  const isApproving = isUpdating && updatingAction === 'ACTIVE';
  const isRejecting = isUpdating && updatingAction === 'REJECTED';

  const shouldTruncate = Boolean(
    job.description && job.description.length > 240
  );
  const displayDescription =
    shouldTruncate && !isExpanded
      ? `${job.description.slice(0, 240).trim()}...`
      : job.description;

  return (
    <Card
      glass
      className="border-border/70 hover:border-amber-500/30 transition-all shadow-sm group"
      data-testid={`pending-job-card-${job.id}`}
    >
      <CardContent className="p-5 sm:p-6 space-y-4">
        {/* Top Header: Title, Company, and Badges */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1.5 flex-1 min-w-0">
            <h3 className="text-lg font-bold text-foreground tracking-tight truncate">
              {job.title}
            </h3>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
              <Building2 className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="truncate">{companyName}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Badge variant="secondary" className="font-normal text-xs">
              {formattedEmployment}
            </Badge>
            <Badge
              variant="warning"
              className="gap-1.5 py-1 px-2.5 text-xs font-semibold"
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Awaiting Review</span>
            </Badge>
          </div>
        </div>

        {/* Recruiter Details & Posting Date */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground bg-secondary/30 px-3.5 py-2.5 rounded-lg border border-border/40">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold text-[10px] shrink-0">
              {job.recruiter?.first_name?.[0]?.toUpperCase() || (
                <User className="h-3.5 w-3.5" />
              )}
            </div>
            <span className="font-medium text-foreground/90 truncate">
              {recruiterFullName}
            </span>
          </div>

          {job.recruiter?.email && (
            <a
              href={`mailto:${job.recruiter.email}`}
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-amber-400 hover:underline transition-colors"
              aria-label={`Email ${recruiterFullName}`}
            >
              <Mail className="h-3.5 w-3.5 shrink-0 text-amber-500/70" />
              <span className="truncate">{job.recruiter.email}</span>
            </a>
          )}

          <div className="flex items-center gap-1.5 ml-auto text-muted-foreground/80">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>Submitted {formattedDate}</span>
          </div>
        </div>

        {/* Required Skills Chips */}
        {job.required_skills && job.required_skills.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Required Skills
            </span>
            <div className="flex flex-wrap gap-1.5">
              {job.required_skills.map((skill, idx) => (
                <Badge
                  key={idx}
                  variant="secondary"
                  className="text-xs px-2.5 py-0.5 font-normal bg-secondary/60"
                >
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Job Description */}
        {job.description && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Job Description
            </span>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {displayDescription}
            </p>
            {shouldTruncate && (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 hover:underline transition-colors pt-0.5"
                aria-expanded={isExpanded}
              >
                {isExpanded ? (
                  <>
                    <span>Show less</span>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    <span>Read full description</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Bottom Actions: Approve & Reject */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border/40">
          <span className="text-xs text-muted-foreground/70 italic">
            Authoritative moderation decision required
          </span>

          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onApprove?.(job)}
              disabled={isUpdating}
              isLoading={isApproving}
              className="gap-1.5 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15 hover:border-emerald-500/70 transition-colors"
              aria-label={`Approve ${job.title}`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Approve</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onReject?.(job)}
              disabled={isUpdating}
              isLoading={isRejecting}
              className="gap-1.5 text-xs border-destructive/40 text-destructive hover:bg-destructive/15 hover:border-destructive/70 transition-colors"
              aria-label={`Reject ${job.title}`}
            >
              <XCircle className="h-3.5 w-3.5" />
              <span>Reject</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
