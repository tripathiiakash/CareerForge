import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Briefcase,
  GraduationCap,
  Globe,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Sparkles,
  Share2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCachedJob, useJobDetail } from './hooks';
import { isValidUuid } from './jobsApi';
import { formatPostedDate } from './components/JobCard';

export const JobDetailsPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [imageError, setImageError] = useState(false);
  const [copied, setCopied] = useState(false);

  const isValidId = isValidUuid(jobId);
  const {
    data: jobDetail,
    isLoading,
    isError,
    error,
    refetch,
  } = useJobDetail(isValidId ? jobId : undefined);

  // Fallback to cached job list item if detail endpoint returned 404 or pending
  const cachedJob = useCachedJob(isValidId ? jobId : undefined);

  const activeJob = jobDetail || cachedJob;

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 1. Invalid UUID format
  if (!isValidId) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/student/jobs')}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Job Board</span>
        </Button>

        <Card glass className="text-center p-12 border-destructive/30">
          <CardContent className="space-y-4 pt-4">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Invalid Job Identifier
              </h1>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
                The specified job link is malformed or not a valid UUID. Please
                select an active role from the job board.
              </p>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate('/student/jobs')}
            >
              Return to Job Board
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 2. Loading State
  if (isLoading && !cachedJob) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-36 bg-secondary/60 rounded animate-pulse" />
        <Card glass className="p-8 animate-pulse space-y-6">
          <div className="flex gap-4">
            <div className="h-16 w-16 rounded-xl bg-secondary/80" />
            <div className="space-y-2 flex-1">
              <div className="h-6 w-1/3 bg-secondary/80 rounded" />
              <div className="h-4 w-1/4 bg-secondary/60 rounded" />
            </div>
          </div>
          <div className="space-y-3 pt-4 border-t border-border/40">
            <div className="h-4 w-full bg-secondary/60 rounded" />
            <div className="h-4 w-5/6 bg-secondary/60 rounded" />
            <div className="h-4 w-4/6 bg-secondary/60 rounded" />
          </div>
        </Card>
      </div>
    );
  }

  // 3. Error and Not Found States (when neither server data nor cached item is available)
  if (isError && !cachedJob) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/student/jobs')}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Job Board</span>
        </Button>

        <Card glass className="text-center p-12">
          <CardContent className="space-y-4 pt-4">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground mx-auto">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Job Posting Not Found
              </h1>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
                {error?.message ||
                  'The requested job posting may have expired, been removed by the employer, or does not exist.'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-1.5"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Retry</span>
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => navigate('/student/jobs')}
              >
                Explore Active Jobs
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activeJob) {
    return null;
  }

  const isInternship = activeJob.employment_type === 'INTERNSHIP';
  const formattedDate = formatPostedDate(activeJob.created_at);
  const companyWebsite: string | null | undefined =
    'website' in activeJob.company ? activeJob.company.website : undefined;
  const descriptionText: string | undefined =
    'description' in activeJob && typeof activeJob.description === 'string'
      ? activeJob.description
      : undefined;
  const hasApplied: boolean =
    'has_applied' in activeJob ? Boolean(activeJob.has_applied) : false;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/student/jobs')}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Job Board</span>
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            className="gap-1.5 text-xs"
            aria-label="Share Job Link"
          >
            {copied ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Link Copied</span>
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5" />
                <span>Share</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Job Header Card */}
      <Card glass className="overflow-hidden border-border/60">
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 shrink-0 rounded-2xl bg-secondary/80 border border-border/60 flex items-center justify-center overflow-hidden shadow-sm">
                {activeJob.company.logo_url && !imageError ? (
                  <img
                    src={activeJob.company.logo_url}
                    alt={`${activeJob.company.name} logo`}
                    onError={() => setImageError(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xl font-bold text-primary tracking-wider uppercase">
                    {activeJob.company.name.slice(0, 2)}
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    {activeJob.company.name}
                  </h2>
                  {companyWebsite && (
                    <a
                      href={companyWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Globe className="h-3 w-3" />
                      <span>Company Website</span>
                    </a>
                  )}
                </div>

                <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                  {activeJob.title}
                </h1>

                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Posted {formattedDate}</span>
                  </span>
                  <span>•</span>
                  <span>Verified Opportunity</span>
                </div>
              </div>
            </div>

            {/* Status / Role Pills */}
            <div className="flex sm:flex-col items-end gap-2">
              {isInternship ? (
                <Badge
                  variant="warning"
                  className="gap-1.5 py-1 px-3 text-xs font-semibold"
                >
                  <GraduationCap className="h-4 w-4" />
                  <span>Internship</span>
                </Badge>
              ) : (
                <Badge
                  variant="info"
                  className="gap-1.5 py-1 px-3 text-xs font-semibold"
                >
                  <Briefcase className="h-4 w-4" />
                  <span>Full Time</span>
                </Badge>
              )}

              {hasApplied ? (
                <Badge
                  variant="success"
                  className="gap-1.5 py-1 px-3 text-xs font-semibold"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Applied</span>
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-xs py-1 px-3 font-normal"
                >
                  Applications Active
                </Badge>
              )}
            </div>
          </div>

          {/* Required Skills Section */}
          <div className="space-y-2 pt-4 border-t border-border/40">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Required Technical Skills
            </h3>
            <div className="flex flex-wrap gap-2">
              {activeJob.required_skills.map((skill) => (
                <Badge
                  key={skill}
                  variant="secondary"
                  className="text-xs px-3 py-1 font-medium bg-secondary/60 border border-border/50"
                >
                  {skill}
                </Badge>
              ))}
            </div>
          </div>

          {/* Job Description Section */}
          <div className="space-y-3 pt-4 border-t border-border/40">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Role Overview & Description
            </h3>

            {descriptionText ? (
              <div className="text-sm sm:text-base text-foreground/90 leading-relaxed whitespace-pre-line space-y-4">
                {descriptionText}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-secondary/30 border border-border/40 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">
                  Position overview is currently synchronized from the active
                  listing.
                </p>
                <p>
                  This position requires expertise in{' '}
                  <span className="text-foreground font-medium">
                    {activeJob.required_skills.join(', ')}
                  </span>
                  . Application workflows and direct resume submission will be
                  connected in subsequent phases.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
