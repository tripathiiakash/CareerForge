import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useRecruiterProfile, useRecruiterOrganization } from './hooks';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Building2,
  User,
  ShieldCheck,
  Clock,
  ArrowRight,
  Globe,
  ExternalLink,
  Briefcase,
  Users,
  Sparkles,
  AlertCircle,
  Loader2,
  Mail,
  PlusCircle,
  Info,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { VerificationStatus } from './types';

export const RecruiterDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { data: profile, isLoading, isError, refetch } = useRecruiterProfile();
  const {
    data: verification,
    isLoading: isVerificationLoading,
    refetch: refetchVerification,
  } = useRecruiterOrganization();

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  const displayName = fullName || user?.email || 'Recruiter';

  const companyName =
    profile?.is_company_assigned && profile.company?.name
      ? profile.company.name
      : verification?.organization_name || null;

  const companyInitials =
    companyName
      ?.split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || 'CO';

  const activeStatus: VerificationStatus =
    verification?.status || (profile?.is_approved ? 'APPROVED' : 'PENDING');

  if (isLoading || isVerificationLoading) {
    return (
      <div
        data-testid="loading-state"
        className="min-h-[50vh] flex flex-col items-center justify-center gap-3"
      >
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        <span className="text-sm text-muted-foreground font-medium">
          Loading recruiter dashboard...
        </span>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        data-testid="error-state"
        className="p-6 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive space-y-3"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <h2 className="font-semibold text-lg">
            Failed to load recruiter data
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          We encountered an issue retrieving your recruiter profile. Please try
          again.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refetch();
            refetchVerification();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 animate-fade-in">
      {/* Clarification Alert Banner */}
      {activeStatus === 'NEEDS_CLARIFICATION' &&
        verification?.clarification_message && (
          <div
            data-testid="clarification-banner"
            className="p-5 rounded-2xl border border-amber-500/50 bg-amber-500/15 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-amber-500/5 animate-fade-in"
          >
            <div className="flex items-start gap-3.5">
              <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-base font-bold text-amber-300">
                  Action Required: Clarification Requested for Organization
                  Verification
                </h2>
                <p className="text-sm text-amber-100/90 leading-relaxed font-mono text-xs sm:text-sm bg-black/20 p-2 rounded-lg border border-amber-500/20">
                  {verification.clarification_message}
                </p>
                <p className="text-xs text-amber-300/80">
                  Please update your organization details or upload additional
                  evidence in your profile to continue verification.
                </p>
              </div>
            </div>
            <Link to="/recruiter/profile" className="shrink-0 w-full sm:w-auto">
              <Button
                size="sm"
                className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-1.5"
              >
                <span>Update Details</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}

      {/* Rejection Alert Banner */}
      {activeStatus === 'REJECTED' &&
        verification?.rejection_reason && (
          <div
            data-testid="rejection-banner"
            className="p-5 rounded-2xl border border-destructive/50 bg-destructive/15 text-destructive flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-destructive/5 animate-fade-in"
          >
            <div className="flex items-start gap-3.5">
              <AlertCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-base font-bold text-destructive">
                  Organization Verification Not Approved
                </h2>
                <p className="text-sm text-destructive font-mono text-xs sm:text-sm bg-black/20 p-2 rounded-lg border border-destructive/20 leading-relaxed">
                  {verification.rejection_reason}
                </p>
                <p className="text-xs text-muted-foreground">
                  Your verification application was not approved by the administrator. Review your submitted details and evidence in your profile.
                </p>
              </div>
            </div>
            <Link to="/recruiter/profile" className="shrink-0 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto border-destructive/40 hover:bg-destructive/10 text-destructive gap-1.5 font-semibold"
              >
                <span>Review in Profile</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}

      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 p-6 sm:p-8 rounded-2xl glass-card border border-border/70 relative overflow-hidden">
        <div className="space-y-2 z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Recruiter Portal</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Welcome, {displayName}
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Manage your hiring requisitions, evaluate candidate profiles, and
            represent {companyName || 'your organization'} on CareerForge.
          </p>
        </div>

        {/* Company & Verification Status Pill */}
        <div className="z-10 shrink-0 w-full md:w-72 p-4 rounded-xl bg-secondary/40 border border-border/60 space-y-3">
          <div className="flex items-center gap-3">
            {profile?.company?.logo_url ? (
              <img
                src={profile.company.logo_url}
                alt={profile.company.name}
                className="h-10 w-10 rounded-lg object-contain bg-secondary/60 p-1 border border-border/50"
              />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold text-xs">
                {companyInitials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <span className="text-xs text-muted-foreground block font-medium">
                Organization
              </span>
              <p className="text-sm font-semibold text-foreground truncate">
                {profile?.is_company_assigned
                  ? profile.company.name
                  : verification?.organization_name
                    ? `${verification.organization_name}`
                    : 'No company assigned'}
              </p>
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between border-t border-border/40 text-xs">
            <span className="text-muted-foreground">Company:</span>
            {profile?.is_company_assigned ? (
              <Badge variant="success" className="gap-1 items-center">
                <ShieldCheck className="h-3 w-3" />
                <span>Assigned</span>
              </Badge>
            ) : (
              <Badge variant="warning" className="gap-1 items-center">
                <Clock className="h-3 w-3" />
                <span>Not Assigned</span>
              </Badge>
            )}
          </div>

          <div className="pt-1 flex items-center justify-between border-t border-border/40 text-xs">
            <span className="text-muted-foreground">Status:</span>
            {activeStatus === 'APPROVED' ? (
              <Badge variant="success" className="gap-1 items-center">
                <ShieldCheck className="h-3 w-3" />
                <span>Verified</span>
              </Badge>
            ) : activeStatus === 'NEEDS_CLARIFICATION' ? (
              <Badge
                variant="warning"
                className="gap-1 items-center border-amber-500/50 bg-amber-500/20 text-amber-300"
              >
                <AlertTriangle className="h-3 w-3" />
                <span>Clarification Needed</span>
              </Badge>
            ) : activeStatus === 'REJECTED' ? (
              <Badge variant="destructive" className="gap-1 items-center">
                <AlertCircle className="h-3 w-3" />
                <span>Rejected</span>
              </Badge>
            ) : (
              <Badge variant="warning" className="gap-1 items-center">
                <Clock className="h-3 w-3" />
                <span>Pending Approval</span>
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Company Not Assigned Callout */}
      {profile && !profile.is_company_assigned && (
        <div
          data-testid="no-company-callout"
          className="p-5 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-3"
        >
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-400">
                Your account is not yet linked to an authoritative company
              </p>
              {verification?.is_submitted ? (
                <>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Organization details for{' '}
                    <strong className="text-foreground">
                      {verification.organization_name}
                    </strong>{' '}
                    have been submitted and are under administrator review. Once
                    an administrator verifies your details and links your
                    company, you will be authorized to post job requisitions.
                  </p>
                  <Link
                    to="/recruiter/profile"
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:underline font-medium pt-1"
                  >
                    <span>View or update verification submission</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    An administrator needs to review your organization details
                    and link your company in CareerForge. Please submit your
                    organization verification details and supporting proof to
                    request approval.
                  </p>
                  <Link
                    to="/recruiter/profile"
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:underline font-medium pt-1"
                  >
                    <span>Submit organization details for verification</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Action / Feature Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Manage Openings Quick Action */}
        <Link to="/recruiter/jobs" className="group">
          <Card
            glass
            className="h-full group-hover:border-emerald-500/50 group-hover:scale-[1.01] transition-all"
          >
            <CardHeader className="space-y-3 pb-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Briefcase className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg">Manage Openings</CardTitle>
              <CardDescription className="text-xs">
                View, edit, or remove your job postings and monitor review
                statuses.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 group-hover:translate-x-1 transition-transform">
                <span>View Job Openings</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Post a Job Quick Action */}
        <Link to="/recruiter/jobs/new" className="group">
          <Card
            glass
            className="h-full group-hover:border-teal-500/50 group-hover:scale-[1.01] transition-all"
          >
            <CardHeader className="space-y-3 pb-3">
              <div className="h-10 w-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <PlusCircle className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg">Post a Role</CardTitle>
              <CardDescription className="text-xs">
                Publish tech internships or full-time roles with required skill
                competencies.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-teal-400 group-hover:translate-x-1 transition-transform">
                <span>Create Requisition</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Recruiter Profile Quick Action */}
        <Link to="/recruiter/profile" className="group">
          <Card
            glass
            className="h-full group-hover:border-sky-500/50 group-hover:scale-[1.01] transition-all"
          >
            <CardHeader className="space-y-3 pb-3">
              <div className="h-10 w-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <User className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg">Recruiter Profile</CardTitle>
              <CardDescription className="text-xs">
                View and edit your personal recruiter profile and organization
                link.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-sky-400 group-hover:translate-x-1 transition-transform">
                <span>Manage Profile</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Profile & Organization Snapshot */}
      <Card glass className="border-border/70">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-xl">Account Snapshot</CardTitle>
            <CardDescription>
              Current credentials and verified organizational binding.
            </CardDescription>
          </div>
          <Link to="/recruiter/profile">
            <Button variant="outline" size="sm">
              Edit Profile
            </Button>
          </Link>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Hiring Manager Info */}
            <div className="p-4 rounded-xl bg-secondary/30 border border-border/40 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <User className="h-4 w-4 text-emerald-400" />
                <span>Hiring Manager</span>
              </div>
              <p className="text-sm font-medium text-foreground">
                {fullName || (
                  <span className="text-muted-foreground italic">
                    Not specified
                  </span>
                )}
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                <Mail className="h-3.5 w-3.5" />
                <span className="truncate">{user?.email}</span>
              </div>
            </div>

            {/* Organization Info */}
            <div className="p-4 rounded-xl bg-secondary/30 border border-border/40 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Building2 className="h-4 w-4 text-emerald-400" />
                <span>Company Organization</span>
              </div>
              <p className="text-sm font-medium text-foreground">
                {companyName || 'Unassigned Company'}
                {!profile?.is_company_assigned && companyName && (
                  <span className="text-xs text-amber-400 block pt-0.5">
                    (Pending Verification)
                  </span>
                )}
              </p>
              {profile?.company?.website && (
                <a
                  href={profile.company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-emerald-400 hover:underline truncate pt-1"
                >
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{profile.company.website}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              )}
            </div>

            {/* Authorization & Access */}
            <div className="p-4 rounded-xl bg-secondary/30 border border-border/40 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>Access Status</span>
              </div>
              <div className="pt-0.5">
                {activeStatus === 'APPROVED' ? (
                  <Badge variant="success" className="text-xs">
                    Approved Recruiter
                  </Badge>
                ) : activeStatus === 'NEEDS_CLARIFICATION' ? (
                  <Badge
                    variant="warning"
                    className="text-xs border-amber-500/50 bg-amber-500/20 text-amber-300"
                  >
                    Clarification Needed
                  </Badge>
                ) : activeStatus === 'REJECTED' ? (
                  <Badge variant="destructive" className="text-xs">
                    Application Rejected
                  </Badge>
                ) : (
                  <Badge variant="warning" className="text-xs">
                    Pending Verification
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                {activeStatus === 'APPROVED'
                  ? 'Authorized to create job postings and manage applicants.'
                  : activeStatus === 'NEEDS_CLARIFICATION'
                    ? 'Administrator requested clarification on your organization details.'
                    : activeStatus === 'REJECTED'
                      ? 'Administrator rejected the organization verification. Review the rejection reason above.'
                      : 'Company registration is awaiting administrator verification.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Job Management Hub */}
      <Card glass className="border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <span>Hiring Capabilities</span>
          </div>
          <CardTitle className="text-xl">
            Recruiter Job & Pipeline Management
          </CardTitle>
          <CardDescription>
            Manage active requisitions, review candidate profiles, and track
            recruitment workflows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-secondary/20 border border-border/40 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Briefcase className="h-4 w-4 text-emerald-400" />
                <span>Job Requisition Posting</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Create and publish internships and full-time tech roles linked
                directly to {companyName || 'your company'}, complete with
                required skill sets and employment criteria.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-secondary/20 border border-border/40 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Users className="h-4 w-4 text-emerald-400" />
                <span>Applicant Tracking & Evaluation</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Review candidate resumes, evaluate applicant profiles, and
                update application status stages (Shortlisted, Rejected)
                directly from your dashboard.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
