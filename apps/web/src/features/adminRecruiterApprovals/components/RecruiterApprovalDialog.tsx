import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Loader2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PendingRecruiter } from '../types';

export interface RecruiterApprovalDialogProps {
  recruiter: PendingRecruiter | null;
  action: 'APPROVE' | 'REJECT' | 'CLARIFY' | null;
  isOpen: boolean;
  isSubmitting?: boolean;
  onConfirm: (payload?: { message?: string; reason?: string }) => void;
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
  const [inputText, setInputText] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  // Reset input when dialog opens or action changes
  useEffect(() => {
    if (isOpen) {
      setInputText('');
      setInputError(null);
    }
  }, [isOpen, action]);

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

  const recruiterName = `${recruiter.first_name} ${recruiter.last_name}`.trim();
  const organizationName =
    recruiter.verification?.organization_name ||
    recruiter.company?.name ||
    'this organization';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInputError(null);

    if (action === 'CLARIFY') {
      const trimmed = inputText.trim();
      if (trimmed.length < 5) {
        setInputError('Clarification message must be at least 5 characters');
        return;
      }
      onConfirm({ message: trimmed });
      return;
    }

    if (action === 'REJECT') {
      const trimmed = inputText.trim();
      if (trimmed.length < 5) {
        setInputError('Rejection reason must be at least 5 characters');
        return;
      }
      onConfirm({ reason: trimmed });
      return;
    }

    onConfirm();
  };

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
              action === 'APPROVE'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                : action === 'CLARIFY'
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                  : 'bg-destructive/15 text-destructive border border-destructive/20'
            }`}
          >
            {action === 'APPROVE' ? (
              <CheckCircle2 className="h-6 w-6" />
            ) : action === 'CLARIFY' ? (
              <HelpCircle className="h-6 w-6" />
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <h2
              id="recruiter-dialog-title"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              {action === 'APPROVE'
                ? 'Approve Recruiter Account'
                : action === 'CLARIFY'
                  ? 'Request Clarification from Recruiter'
                  : 'Reject Recruiter Application'}
            </h2>
            <p
              id="recruiter-dialog-description"
              className="text-sm text-muted-foreground leading-relaxed"
            >
              {action === 'APPROVE' ? (
                <>
                  Are you sure you want to approve{' '}
                  <span className="font-semibold text-foreground">
                    {recruiterName}
                  </span>{' '}
                  from{' '}
                  <span className="font-semibold text-foreground">
                    {organizationName}
                  </span>
                  ? This will verify their account, enabling them to publish job
                  postings and review student candidate applications.
                </>
              ) : action === 'CLARIFY' ? (
                <>
                  Explain what additional information, documentation, or
                  corrections are needed for{' '}
                  <span className="font-semibold text-foreground">
                    {recruiterName}
                  </span>{' '}
                  ({organizationName}). The recruiter will be notified and can
                  update their submission.
                </>
              ) : (
                <>
                  Specify the reason for rejecting the verification request for{' '}
                  <span className="font-semibold text-foreground">
                    {recruiterName}
                  </span>{' '}
                  ({organizationName}).
                </>
              )}
            </p>
          </div>

          {/* Additional input field for CLARIFY or REJECT */}
          {action !== 'APPROVE' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                {action === 'CLARIFY'
                  ? 'Clarification Message *'
                  : 'Rejection Reason *'}
              </label>
              <textarea
                rows={3}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  if (inputError) setInputError(null);
                }}
                placeholder={
                  action === 'CLARIFY'
                    ? 'e.g., Please upload an official certificate of incorporation or provide a valid company website...'
                    : 'e.g., Company website domain does not match recruiter email domain, or organization could not be verified...'
                }
                className="w-full rounded-xl bg-background/60 border border-border/80 px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all placeholder:text-muted-foreground resize-y"
                required
                data-testid="dialog-reason-input"
              />
              {inputError && (
                <p className="text-xs text-destructive">{inputError}</p>
              )}
            </div>
          )}

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
              <span className="font-medium text-foreground">Organization:</span>
              <span>{organizationName}</span>
            </div>
            {recruiter.verification?.website_url && (
              <div className="flex justify-between">
                <span className="font-medium text-foreground">Website:</span>
                <span className="truncate max-w-[200px]">
                  {recruiter.verification.website_url}
                </span>
              </div>
            )}
            {recruiter.verification?.evidence_original_name && (
              <div className="flex justify-between">
                <span className="font-medium text-foreground">Evidence:</span>
                <span className="text-emerald-400">
                  {recruiter.verification.evidence_original_name}
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
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className={`text-xs gap-1.5 ${
                action === 'APPROVE'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : action === 'CLARIFY'
                    ? 'bg-amber-500 hover:bg-amber-600 text-black font-semibold'
                    : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : action === 'APPROVE' ? (
                <span>Confirm Approval</span>
              ) : action === 'CLARIFY' ? (
                <span>Send Clarification Request</span>
              ) : (
                <span>Confirm Rejection</span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
