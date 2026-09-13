import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { JobApplicant } from '../types';

export interface RejectApplicantDialogProps {
  applicant: JobApplicant | null;
  isOpen: boolean;
  isRejecting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const RejectApplicantDialog: React.FC<RejectApplicantDialogProps> = ({
  applicant,
  isOpen,
  isRejecting,
  onConfirm,
  onCancel,
}) => {
  // Support closing on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isRejecting) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isRejecting, onCancel]);

  if (!isOpen || !applicant) return null;

  const candidateName =
    `${applicant.student.first_name || ''} ${applicant.student.last_name || ''}`.trim() ||
    'this candidate';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-destructive/40 bg-card p-6 shadow-2xl space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="h-11 w-11 rounded-xl bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isRejecting}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          <h2
            id="reject-dialog-title"
            className="text-lg font-bold text-foreground"
          >
            Reject Candidate Application
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Are you sure you want to mark{' '}
            <strong className="text-foreground">"{candidateName}"</strong> as
            rejected?
          </p>
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
            Rejection is a terminal status transition. The candidate will see
            that their application was not selected.
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isRejecting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            isLoading={isRejecting}
            className="gap-2"
          >
            {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
          </Button>
        </div>
      </div>
    </div>
  );
};
