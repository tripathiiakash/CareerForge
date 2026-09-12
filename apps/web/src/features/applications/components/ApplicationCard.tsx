import React from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Calendar,
  Briefcase,
  GraduationCap,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApplicationStatus, StudentApplicationItem } from '../types';

export function formatApplicationDate(dateString: string): string {
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

export function getStatusBadgeConfig(status: ApplicationStatus): {
  variant: 'info' | 'success' | 'destructive' | 'outline';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
} {
  switch (status) {
    case 'SHORTLISTED':
      return {
        variant: 'success',
        label: 'Shortlisted',
        icon: CheckCircle2,
      };
    case 'REJECTED':
      return {
        variant: 'destructive',
        label: 'Not Selected',
        icon: XCircle,
      };
    case 'APPLIED':
    default:
      return {
        variant: 'info',
        label: 'Application Received',
        icon: Clock,
      };
  }
}

export interface ApplicationCardProps {
  application: StudentApplicationItem;
}

export const ApplicationCard: React.FC<ApplicationCardProps> = ({
  application,
}) => {
  const { job, status, applied_at, updated_at } = application;
  const isInternship = job.employment_type === 'INTERNSHIP';
  const statusConfig = getStatusBadgeConfig(status);
  const StatusIcon = statusConfig.icon;
  const jobDetailUrl = `/student/jobs/${job.id}`;

  const formattedAppliedDate = formatApplicationDate(applied_at);
  const formattedUpdatedDate = formatApplicationDate(updated_at);
  const hasUpdate =
    updated_at &&
    new Date(updated_at).getTime() - new Date(applied_at).getTime() > 60 * 1000;

  return (
    <Card
      glass
      className="group transition-all duration-200 hover:border-border/90 hover:shadow-md"
    >
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Main Info */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground/70" />
                <span>{job.company_name}</span>
              </span>

              {isInternship ? (
                <Badge
                  variant="warning"
                  className="gap-1 py-0.5 px-2 text-[10px] font-semibold"
                >
                  <GraduationCap className="h-3 w-3" />
                  <span>Internship</span>
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-1 py-0.5 px-2 text-[10px] font-medium"
                >
                  <Briefcase className="h-3 w-3" />
                  <span>Full Time</span>
                </Badge>
              )}
            </div>

            <Link to={jobDetailUrl} className="block group/link">
              <h2 className="text-lg font-bold text-foreground tracking-tight group-hover/link:text-primary transition-colors">
                {job.title}
              </h2>
            </Link>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-0.5">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground/70" />
                <span>Applied {formattedAppliedDate}</span>
              </span>

              {hasUpdate && (
                <>
                  <span>•</span>
                  <span>Updated {formattedUpdatedDate}</span>
                </>
              )}
            </div>
          </div>

          {/* Right Action / Status Area */}
          <div className="flex sm:flex-col items-center sm:items-end justify-between gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
            <Badge
              variant={statusConfig.variant}
              className="gap-1.5 py-1 px-3 text-xs font-semibold"
            >
              <StatusIcon className="h-3.5 w-3.5" />
              <span>{statusConfig.label}</span>
            </Badge>

            <Link to={jobDetailUrl}>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs text-muted-foreground hover:text-foreground h-8"
              >
                <span>View Job</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
