import React, { useState } from 'react';
import {
  GraduationCap,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  ExternalLink,
  User,
  Building2,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { openResumePdf } from '@/features/resumes/resumesApi';
import { ApplicantStatus, JobApplicant } from '../types';

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

export function getApplicantStatusBadgeConfig(status: ApplicantStatus): {
  variant: 'info' | 'success' | 'destructive' | 'warning';
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
        label: 'Rejected',
        icon: XCircle,
      };
    case 'APPLIED':
    default:
      return {
        variant: 'warning',
        label: 'Applied',
        icon: Clock,
      };
  }
}

export interface ApplicantCardProps {
  applicant: JobApplicant;
  onShortlist?: (applicant: JobApplicant) => void;
  onReject?: (applicant: JobApplicant) => void;
  isUpdating?: boolean;
  updatingAction?: 'SHORTLISTED' | 'REJECTED' | null;
}

export const ApplicantCard: React.FC<ApplicantCardProps> = ({
  applicant,
  onShortlist,
  onReject,
  isUpdating = false,
  updatingAction = null,
}) => {
  const { student, resume, status, applied_at } = applicant;
  const statusConfig = getApplicantStatusBadgeConfig(status);
  const StatusIcon = statusConfig.icon;

  const fullName =
    `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
    'Candidate';
  const formattedDate = formatApplicationDate(applied_at);

  // Education details synthesis
  const educationParts: string[] = [];
  if (student.degree) educationParts.push(student.degree);
  if (student.university) educationParts.push(student.university);
  if (student.graduation_year)
    educationParts.push(`Class of ${student.graduation_year}`);
  const educationSummary = educationParts.join(' • ');

  const isShortlisting = isUpdating && updatingAction === 'SHORTLISTED';
  const isRejecting = isUpdating && updatingAction === 'REJECTED';

  const [isOpeningResume, setIsOpeningResume] = useState(false);

  const handleOpenResume = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!resume?.id || isOpeningResume) return;
    setIsOpeningResume(true);
    try {
      await openResumePdf(
        resume.id,
        `${fullName.replace(/\s+/g, '_')}_Resume.pdf`
      );
    } catch {
      // Fallback: If blob fetch fails, attempt direct link if present
      if (resume.file_url) {
        window.open(resume.file_url, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setIsOpeningResume(false);
    }
  };

  return (
    <Card
      glass
      className="border-border/70 hover:border-emerald-500/30 transition-all shadow-sm group"
      data-testid={`applicant-card-${applicant.application_id}`}
    >
      <CardContent className="p-5 sm:p-6 space-y-4">
        {/* Top Header: Candidate Info & Current Status */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0">
                {student.first_name?.[0]?.toUpperCase() || (
                  <User className="h-5 w-5" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground tracking-tight truncate">
                  {fullName}
                </h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground/70" />
                  <span>Applied {formattedDate}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Current Status Badge */}
          <div className="shrink-0 self-start sm:self-auto">
            <Badge
              variant={statusConfig.variant}
              className="gap-1.5 py-1 px-3 text-xs font-semibold"
            >
              <StatusIcon className="h-3.5 w-3.5" />
              <span>{statusConfig.label}</span>
            </Badge>
          </div>
        </div>

        {/* Education & Academic Credentials */}
        {educationSummary && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/30 px-3 py-2 rounded-lg border border-border/40">
            <GraduationCap className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="truncate">{educationSummary}</span>
          </div>
        )}

        {/* Skills Chips */}
        {student.skills && student.skills.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Candidate Skills
            </span>
            <div className="flex flex-wrap gap-1.5">
              {student.skills.map((skill, idx) => (
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

        {/* Bottom Actions: Resume Link & Status Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border/40">
          {/* Resume View Link */}
          {resume?.file_url ? (
            <button
              type="button"
              onClick={handleOpenResume}
              disabled={isOpeningResume}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:underline transition-colors bg-transparent border-0 p-0 cursor-pointer disabled:opacity-60"
              aria-label={`View PDF resume for ${fullName}`}
            >
              {isOpeningResume ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span>{isOpeningResume ? 'Opening Resume...' : 'View PDF Resume'}</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          ) : (
            <span className="text-xs text-muted-foreground italic">
              No resume document attached
            </span>
          )}

          {/* Workflow Action Buttons */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {status === 'APPLIED' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onShortlist?.(applicant)}
                  disabled={isUpdating}
                  isLoading={isShortlisting}
                  className="gap-1.5 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15 hover:border-emerald-500/70"
                  aria-label={`Shortlist ${fullName}`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Shortlist</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onReject?.(applicant)}
                  disabled={isUpdating}
                  isLoading={isRejecting}
                  className="gap-1.5 text-xs border-destructive/40 text-destructive hover:bg-destructive/15 hover:border-destructive/70"
                  aria-label={`Reject ${fullName}`}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span>Reject</span>
                </Button>
              </>
            )}

            {status === 'SHORTLISTED' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onReject?.(applicant)}
                disabled={isUpdating}
                isLoading={isRejecting}
                className="gap-1.5 text-xs border-destructive/40 text-destructive hover:bg-destructive/15 hover:border-destructive/70"
                aria-label={`Reject ${fullName}`}
              >
                <XCircle className="h-3.5 w-3.5" />
                <span>Reject</span>
              </Button>
            )}

            {status === 'REJECTED' && (
              <span className="text-xs text-muted-foreground font-medium italic">
                Candidate not selected
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
