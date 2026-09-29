import React from 'react';
import {
  Building2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  User,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PendingRecruiter } from '../types';

interface PendingRecruiterCardProps {
  recruiter: PendingRecruiter;
  onApprove: (recruiter: PendingRecruiter) => void;
  onReject: (recruiter: PendingRecruiter) => void;
  isUpdating: boolean;
  updatingAction: 'APPROVE' | 'REJECT' | null;
}

export const PendingRecruiterCard: React.FC<PendingRecruiterCardProps> = ({
  recruiter,
  onApprove,
  onReject,
  isUpdating,
  updatingAction,
}) => {
  const formattedDate = (() => {
    try {
      const d = new Date(recruiter.created_at);
      if (Number.isNaN(d.getTime())) return 'Recently';
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Recently';
    }
  })();

  const fullName = `${recruiter.first_name} ${recruiter.last_name}`.trim();
  const companyName = recruiter.company?.name || 'Unspecified Organization';
  const companyWebsite = recruiter.company?.website;

  return (
    <Card
      className="p-5 transition-all duration-200 border-border/60 hover:border-border hover:shadow-md bg-card/60 backdrop-blur-sm"
      data-testid={`pending-recruiter-card-${recruiter.id}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {/* Left Information Section */}
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Building2 className="h-5 w-5" />
          </div>

          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold tracking-tight text-foreground truncate">
                {companyName}
              </h3>
              <Badge variant="warning" className="text-xs px-2 py-0.5">
                Pending Verification
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 font-medium text-foreground/85">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{fullName}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{recruiter.email}</span>
              </div>

              {companyWebsite && (
                <a
                  href={companyWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline hover:text-primary/80 transition-colors"
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span className="truncate">Website</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}

              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Registered {formattedDate}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2.5 pt-2 sm:pt-0 sm:self-center shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onReject(recruiter)}
            disabled={isUpdating}
            className="text-xs border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
            data-testid={`reject-recruiter-btn-${recruiter.id}`}
          >
            {isUpdating && updatingAction === 'REJECT' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            <span>Reject</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => onApprove(recruiter)}
            disabled={isUpdating}
            className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            data-testid={`approve-recruiter-btn-${recruiter.id}`}
          >
            {isUpdating && updatingAction === 'APPROVE' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            <span>Approve Recruiter</span>
          </Button>
        </div>
      </div>
    </Card>
  );
};
