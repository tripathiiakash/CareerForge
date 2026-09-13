import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PendingJob, AdminModerationJobStatus } from '../types';

export interface ModerationActionDialogProps {
  job: PendingJob | null;
  action: AdminModerationJobStatus | null;
  isOpen: boolean;
  isSubmitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ModerationActionDialog: React.FC<ModerationActionDialogProps> = ({
  job,
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

  if (!isOpen || !job || !action) return null;

  const isApprove = action === 'ACTIVE';
  const companyName = job.company?.name || 'the company';
  const dialogTitle = isApprove ? 'Approve Job Posting' : 'Reject Job Posting';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="moderation-dialog-title"
      aria-describedby="moderation-dialog-description"
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
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Dialog Content */}
        <div className="space-y-3">
          <h2
            id="moderation-dialog-title"
            className="text-lg font-bold text-foreground"
          >
            {dialogTitle}
          </h2>
          <p
            id="moderation-dialog-description"
            className="text-sm text-muted-foreground leading-relaxed"
          >
            Are you sure you want to {isApprove ? 'approve' : 'reject'}{' '}
            <strong className="text-foreground">"{job.title}"</strong> for{' '}
            <strong className="text-foreground">{companyName}</strong>?
          </p>

          {isApprove ? (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
              Approving this job will publish it immediately, making it
              discoverable to all qualified students on the job board.
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              Rejection is an authoritative moderation decision. This job
              posting will be marked as rejected and hidden from platform
              listings.
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border/40">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={isApprove ? 'default' : 'destructive'}
            size="sm"
            onClick={onConfirm}
            isLoading={isSubmitting}
            className={
              isApprove
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                : undefined
            }
          >
            {isApprove ? 'Approve Job' : 'Reject Job'}
          </Button>
        </div>
      </div>
    </div>
  );
};
