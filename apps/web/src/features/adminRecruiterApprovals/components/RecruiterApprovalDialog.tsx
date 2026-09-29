import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PendingRecruiter } from '../types';

export interface RecruiterApprovalDialogProps {
  recruiter: PendingRecruiter | null;
  action: 'APPROVE' | 'REJECT' | null;
  isOpen: boolean;
  isSubmitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const RecruiterApprovalDialog: React.FC<
  RecruiterApprovalDialogProps
> = ({
  recruiter,
  action,
  isOpen,
  isSubmitting = false,
  onConfirm,
  onCancel,
}) => {
  // Support closing on Escape key when not submitting
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onCancel]);

  if (!isOpen || !recruiter || !action) return null;

  const isApprove = action === 'APPROVE';
  const recruiterName = `${recruiter.first_name} ${recruiter.last_name}`.trim();
  const companyName = recruiter.company?.name || 'this organization';
  const dialogTitle = isApprove
    ? 'Approve Recruiter Account'
    : 'Reject Recruiter Account';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recruiter-dialog-title"
      aria-describedby="recruiter-dialog-description"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-6">
        {/* Header with Icon and Close Button */}
        <div className="flex items-start justify-between">
          <div
            className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
              isApprove
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                : 'bg-destructive/15 text-destructive border border-destructive/20'
            }`}
          >
            {isApprove ? (
              <CheckCircle2 className="h-6 w-6" />
            ) : (
              <AlertTriangle className="h-6 w-6" />
            )}
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-secondary transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <h2
            id="recruiter-dialog-title"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            {dialogTitle}
          </h2>
          <p
            id="recruiter-dialog-description"
            className="text-sm text-muted-foreground leading-relaxed"
          >
            {isApprove ? (
              <>
                Are you sure you want to approve{' '}
                <span className="font-semibold text-foreground">
                  {recruiterName}
                </span>{' '}
                from{' '}
                <span className="font-semibold text-foreground">
                  {companyName}
                </span>
                ? This will verify their account, enabling them to publish job
                postings and review student candidate applications.
              </>
            ) : (
              <>
                Are you sure you want to reject the recruiter application for{' '}
                <span className="font-semibold text-foreground">
                  {recruiterName}
                </span>{' '}
                from{' '}
                <span className="font-semibold text-foreground">
                  {companyName}
                </span>
                ? Their account will remain unapproved and blocked from posting
                jobs.
              </>
            )}
          </p>
        </div>

        {/* Recruiter Details Summary Card */}
        <div className="p-3.5 rounded-xl bg-secondary/30 border border-border/50 text-xs space-y-1.5 text-muted-foreground">
          <div className="flex justify-between">
            <span className="font-medium text-foreground">Recruiter:</span>
            <span>{recruiterName}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-foreground">Email:</span>
            <span>{recruiter.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-foreground">Company:</span>
            <span>{companyName}</span>
          </div>
          {recruiter.company?.website && (
            <div className="flex justify-between">
              <span className="font-medium text-foreground">Website:</span>
              <span className="truncate max-w-[200px]">
                {recruiter.company.website}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
            className="text-xs"
          >
            Cancel
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={onConfirm}
            disabled={isSubmitting}
            className={`text-xs gap-1.5 ${
              isApprove
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : isApprove ? (
              <span>Confirm Approval</span>
            ) : (
              <span>Confirm Rejection</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
