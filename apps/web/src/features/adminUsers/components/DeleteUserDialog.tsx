import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminUser } from '../types';
import { getUserDisplayName } from './AdminUserCard';

export interface DeleteUserDialogProps {
  user: AdminUser | null;
  isOpen: boolean;
  isDeleting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteUserDialog: React.FC<DeleteUserDialogProps> = ({
  user,
  isOpen,
  isDeleting = false,
  onConfirm,
  onCancel,
}) => {
  // Support closing on Escape key when not deleting
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen || !user) return null;

  const displayName = getUserDisplayName(user);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-user-dialog-title"
      aria-describedby="delete-user-dialog-description"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-6">
        {/* Header with Warning Icon and Close Button */}
        <div className="flex items-start justify-between">
          <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 bg-destructive/15 text-destructive border border-destructive/20">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg disabled:opacity-50"
            aria-label="Close delete dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Dialog Content */}
        <div className="space-y-3">
          <h2
            id="delete-user-dialog-title"
            className="text-lg font-bold text-foreground"
          >
            Delete User Account
          </h2>
          <p
            id="delete-user-dialog-description"
            className="text-sm text-muted-foreground leading-relaxed"
          >
            Are you sure you want to permanently delete the account for{' '}
            <strong className="text-foreground">{displayName}</strong> (
            <span className="text-foreground font-mono text-xs">
              {user.email}
            </span>
            )?
          </p>

          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive space-y-1">
            <p className="font-semibold">
              Warning: This action is irreversible.
            </p>
            <p>
              Deleting this user will permanently remove their profile,
              authentication credentials, and all associated platform records
              (resumes, job postings, applications, and AI analyses).
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border/40">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            isLoading={isDeleting}
            disabled={isDeleting}
          >
            Delete User
          </Button>
        </div>
      </div>
    </div>
  );
};
