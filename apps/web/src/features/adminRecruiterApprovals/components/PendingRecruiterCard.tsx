import React, { useState } from 'react';
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
  HelpCircle,
  FileText,
  Download,
  Briefcase,
  Linkedin,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PendingRecruiter } from '../types';
import { getAdminEvidenceDownloadUrl } from '../adminRecruiterApi';

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  if (bytes < k) return `${bytes} B`;
  const kb = bytes / k;
  if (kb < k) return `${kb.toFixed(1)} KB`;
  return `${(kb / k).toFixed(2)} MB`;
}

export interface PendingRecruiterCardProps {
  recruiter: PendingRecruiter;
  onApprove: (recruiter: PendingRecruiter) => void;
  onReject: (recruiter: PendingRecruiter) => void;
  onClarify?: (recruiter: PendingRecruiter) => void;
  isUpdating: boolean;
  updatingAction: 'APPROVE' | 'REJECT' | 'CLARIFY' | null;
}

export const PendingRecruiterCard: React.FC<PendingRecruiterCardProps> = ({
  recruiter,
  onApprove,
  onReject,
  onClarify,
  isUpdating,
  updatingAction,
}) => {
  const [showDescription, setShowDescription] = useState(false);

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
  const organizationName =
    recruiter.verification?.organization_name ||
    recruiter.company?.name ||
    'Unspecified Organization';

  const companyWebsite =
    recruiter.verification?.website_url || recruiter.company?.website || null;

  const companyLinkedin = recruiter.verification?.linkedin_url || null;
  const designation = recruiter.verification?.designation || null;
  const description = recruiter.verification?.description || null;
  const verification = recruiter.verification;
  const status = verification?.status || 'PENDING';

  return (
    <Card
      className="p-5 transition-all duration-200 border-border/60 hover:border-border hover:shadow-md bg-card/60 backdrop-blur-sm space-y-4"
      data-testid={`pending-recruiter-card-${recruiter.id}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {/* Left Information Section */}
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Building2 className="h-5 w-5" />
          </div>

          <div className="space-y-2 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold tracking-tight text-foreground truncate">
                {organizationName}
              </h3>
              {status === 'NEEDS_CLARIFICATION' ? (
                <Badge
                  variant="warning"
                  className="text-xs px-2 py-0.5 border-amber-500/40 bg-amber-500/20 text-amber-300 gap-1"
                >
                  <AlertTriangle className="h-3 w-3" />
                  <span>Clarification Requested</span>
                </Badge>
              ) : status === 'REJECTED' ? (
                <Badge variant="destructive" className="text-xs px-2 py-0.5">
                  Rejected
                </Badge>
              ) : (
                <Badge variant="warning" className="text-xs px-2 py-0.5">
                  Pending Verification
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 font-medium text-foreground/85">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{fullName}</span>
              </div>

              {designation && (
                <div className="flex items-center gap-1.5 text-foreground/80">
                  <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{designation}</span>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{recruiter.email}</span>
              </div>

              {companyWebsite && (
                <a
                  href={companyWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-emerald-400 hover:underline transition-colors"
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span className="truncate">Website</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}

              {companyLinkedin && (
                <a
                  href={companyLinkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sky-400 hover:underline transition-colors"
                >
                  <Linkedin className="h-3.5 w-3.5" />
                  <span className="truncate">LinkedIn</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}

              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Registered {formattedDate}</span>
              </div>
            </div>

            {/* Description toggle */}
            {description && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowDescription(!showDescription)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <span>
                    {showDescription
                      ? 'Hide Details'
                      : 'View Details & Description'}
                  </span>
                  {showDescription ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
                {showDescription && (
                  <p className="mt-2 text-xs bg-secondary/30 p-3 rounded-lg border border-border/50 text-foreground/90 whitespace-pre-line leading-relaxed animate-fade-in">
                    {description}
                  </p>
                )}
              </div>
            )}

            {/* Clarification message note */}
            {status === 'NEEDS_CLARIFICATION' &&
              verification?.clarification_message && (
                <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200 space-y-1">
                  <span className="font-semibold text-amber-300 block">
                    Clarification Requested:
                  </span>
                  <p className="font-mono text-xs text-amber-100">
                    {verification.clarification_message}
                  </p>
                </div>
              )}

            {/* Rejection reason note */}
            {status === 'REJECTED' && verification?.rejection_reason && (
              <div className="p-2.5 rounded-lg border border-destructive/30 bg-destructive/10 text-xs text-destructive space-y-1">
                <span className="font-semibold block">Rejection Reason:</span>
                <p className="font-mono text-xs text-destructive-foreground/90">
                  {verification.rejection_reason}
                </p>
              </div>
            )}

            {/* Verification Evidence Document Download Link */}
            {verification?.evidence_file_key && (
              <div className="pt-1.5 flex items-center gap-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg border border-border/70 bg-secondary/40 text-xs">
                  <FileText className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="font-medium text-foreground truncate max-w-[200px]">
                    {verification.evidence_original_name ||
                      'Verification Proof'}
                  </span>
                  <span className="text-muted-foreground">
                    ({formatFileSize(verification.evidence_size_bytes)})
                  </span>
                  <a
                    href={getAdminEvidenceDownloadUrl(recruiter.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-semibold"
                    download={verification.evidence_original_name || 'evidence'}
                    title="Download evidence document"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 sm:self-center shrink-0">
          {onClarify && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onClarify(recruiter)}
              disabled={isUpdating}
              className="text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 gap-1.5"
              data-testid={`clarify-recruiter-btn-${recruiter.id}`}
            >
              {isUpdating && updatingAction === 'CLARIFY' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <HelpCircle className="h-3.5 w-3.5" />
              )}
              <span>Clarify</span>
            </Button>
          )}

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
