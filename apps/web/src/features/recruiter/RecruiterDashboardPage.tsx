import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useRecruiterProfile } from './hooks';
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
} from 'lucide-react';

export const RecruiterDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { data: profile, isLoading, isError, refetch } = useRecruiterProfile();

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  const displayName = fullName || user?.email || 'Recruiter';

  const companyInitials =
    profile?.company?.name
      ?.split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || 'CO';

  if (isLoading) {
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
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 animate-fade-in">
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
            represent {profile?.company?.name || 'your organization'} on
            CareerForge.
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
                {profile?.company?.name || 'Unassigned Company'}
              </p>
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between border-t border-border/40 text-xs">
            <span className="text-muted-foreground">Status:</span>
            {profile?.is_approved ? (
              <Badge variant="success" className="gap-1 items-center">
                <ShieldCheck className="h-3 w-3" />
                <span>Verified</span>
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

      {/* Quick Action / Feature Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recruiter Profile Quick Action */}
        <Link to="/recruiter/profile" className="group">
          <Card
            glass
            className="h-full group-hover:border-emerald-500/50 group-hover:scale-[1.01] transition-all"
          >
            <CardHeader className="space-y-3 pb-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <User className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg">Recruiter Profile</CardTitle>
              <CardDescription className="text-xs">
                View and edit your personal recruiter profile, view your
                organization link, and manage hiring credentials.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 group-hover:translate-x-1 transition-transform">
                <span>Manage Profile</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Verification Overview */}
        <Card glass className="h-full">
          <CardHeader className="space-y-3 pb-3">
            <div className="h-10 w-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
              <Building2 className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">Company Representation</CardTitle>
            <CardDescription className="text-xs">
              Review corporate affiliation and registered company profile
              details.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <div className="text-xs text-muted-foreground">
              {profile?.company?.website ? (
                <a
                  href={profile.company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span>{profile.company.website}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span>No website registered</span>
              )}
            </div>
            <div className="pt-1">
              <Link to="/recruiter/profile">
                <Button variant="outline" size="sm" className="text-xs gap-1.5">
                  <span>View Details</span>
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
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
                {profile?.company?.name || 'Unassigned Company'}
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
                {profile?.is_approved ? (
                  <Badge variant="success" className="text-xs">
                    Approved Recruiter
                  </Badge>
                ) : (
                  <Badge variant="warning" className="text-xs">
                    Pending Verification
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                {profile?.is_approved
                  ? 'Authorized to create job postings and manage applicants.'
                  : 'Company registration is awaiting administrator verification.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Coming Next / Future Job Management Readiness */}
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
            Recruiter job posting, active position management, and candidate
            applicant pipelines launch in Phase 5.11.
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
                directly to {profile?.company?.name || 'your company'}, complete
                with required skill sets and employment criteria.
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
