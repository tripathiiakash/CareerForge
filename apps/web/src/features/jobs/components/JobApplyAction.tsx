import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import {
  CheckCircle2,
  FileText,
  AlertCircle,
  LogIn,
  Send,
  Upload,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/auth/AuthContext';
import { useApplyToJob, useStudentResumes } from '../hooks';
import { StudentResumeItem } from '../types';

export interface JobApplyActionProps {
  jobId: string;
  jobTitle: string;
  companyName: string;
  hasApplied: boolean;
  className?: string;
}

export const JobApplyAction: React.FC<JobApplyActionProps> = ({
  jobId,
  companyName,
  hasApplied: initialHasApplied,
  className = '',
}) => {
  const location = useLocation();
  const { isAuthenticated, role } = useAuth();
  const [locallyApplied, setLocallyApplied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRetryable, setIsRetryable] = useState(true);

  const isApplied = initialHasApplied || locallyApplied;
  const isStudent = isAuthenticated && role === 'STUDENT';

  // Only query student resumes if user is an authenticated student and hasn't applied
  const {
    data: resumes = [],
    isLoading: isLoadingResumes,
    isError: isResumeError,
    refetch: refetchResumes,
  } = useStudentResumes(isStudent && !isApplied);

  const applyMutation = useApplyToJob(jobId);

  // Identify active / primary resume
  const primaryResume: StudentResumeItem | undefined =
    resumes.find((r) => r.is_primary) || resumes[0];

  const handleApply = async () => {
    if (!isStudent || isApplied || applyMutation.isPending) return;

    if (!primaryResume) {
      setErrorMessage(
        'Please upload an active resume to your profile before applying.'
      );
      setIsRetryable(false);
      return;
    }

    setErrorMessage(null);

    applyMutation.mutate(
      { resumeId: primaryResume.id },
      {
        onSuccess: () => {
          setLocallyApplied(true);
          setErrorMessage(null);
        },
        onError: (err) => {
          if (axios.isAxiosError(err)) {
            const status = err.response?.status;
            const backendMessage = (
              err.response?.data as { message?: string } | undefined
            )?.message;

            if (status === 409) {
              // Duplicate application: treat as applied immediately
              setLocallyApplied(true);
              setErrorMessage('You have already applied to this job posting.');
              setIsRetryable(false);
              return;
            }

            if (status === 401) {
              setErrorMessage(
                'Your session has expired. Please sign in again to submit your application.'
              );
              setIsRetryable(false);
              return;
            }

            if (status === 403) {
              setErrorMessage(
                'Only authenticated students with valid resumes can apply for jobs.'
              );
              setIsRetryable(false);
              return;
            }

            if (status === 404) {
              if (
                typeof backendMessage === 'string' &&
                backendMessage.toLowerCase().includes('resume')
              ) {
                setErrorMessage(
                  'Your selected resume could not be found. Please upload a fresh resume.'
                );
              } else {
                setErrorMessage(
                  'This job posting is no longer available or does not exist.'
                );
              }
              setIsRetryable(false);
              return;
            }

            if (status === 400) {
              setErrorMessage(
                'This job posting is currently not accepting applications.'
              );
              setIsRetryable(false);
              return;
            }
          }

          // Generic network or unexpected error
          setErrorMessage(
            'Unable to submit application. Please check your connection and try again.'
          );
          setIsRetryable(true);
        },
      }
    );
  };

  // State A: Anonymous Visitor
  if (!isAuthenticated) {
    const loginRedirectUrl = `/auth/login?redirect=${encodeURIComponent(
      location.pathname
    )}`;

    return (
      <Card
        glass
        className={`border-border/60 overflow-hidden bg-secondary/15 ${className}`}
      >
        <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold text-foreground">
                Ready to take the next step in your career?
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Sign in with your student account to apply with your AI-verified
              resume.
            </p>
          </div>
          <Link to={loginRedirectUrl} className="shrink-0">
            <Button size="default" className="gap-2">
              <LogIn className="h-4 w-4" />
              <span>Sign In to Apply</span>
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // State B: Authenticated Non-Student (Recruiter or Admin)
  if (role !== 'STUDENT') {
    const formattedRole =
      role === 'RECRUITER'
        ? 'Recruiter'
        : role === 'ADMIN'
          ? 'Administrator'
          : 'Staff';

    return (
      <Card
        glass
        className={`border-border/60 overflow-hidden bg-secondary/10 ${className}`}
      >
        <CardContent className="p-5 flex items-center gap-3 text-xs sm:text-sm text-muted-foreground">
          <AlertCircle className="h-5 w-5 text-muted-foreground/70 shrink-0" />
          <p>
            You are viewing this job as a{' '}
            <span className="font-semibold text-foreground">
              {formattedRole}
            </span>
            . Job applications can only be submitted from verified Student
            accounts.
          </p>
        </CardContent>
      </Card>
    );
  }

  // State E & F: Already Applied (from server or local successful mutation)
  if (isApplied) {
    return (
      <Card
        glass
        className={`border-emerald-500/30 bg-emerald-950/10 overflow-hidden ${className}`}
      >
        <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <h3 className="text-base font-semibold text-foreground">
                Application Submitted
              </h3>
              <Badge variant="success" className="text-xs font-semibold py-0.5">
                Applied
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Your profile and resume have been delivered to the hiring team at{' '}
              <span className="font-medium text-foreground">{companyName}</span>
              .
            </p>
          </div>
          <Button
            disabled
            variant="outline"
            size="default"
            className="gap-2 border-emerald-500/30 text-emerald-400 bg-emerald-950/20 cursor-default opacity-90 shrink-0"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Applied</span>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // State C: Student without Resumes uploaded
  if (!isLoadingResumes && !isResumeError && resumes.length === 0) {
    return (
      <Card
        glass
        className={`border-amber-500/30 bg-amber-950/10 overflow-hidden ${className}`}
      >
        <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-400" />
              <h3 className="text-base font-semibold text-foreground">
                Resume Required to Apply
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Please upload a resume PDF to your profile before applying to this
              position.
            </p>
          </div>
          <Link to="/student/resume" className="shrink-0">
            <Button
              variant="default"
              size="default"
              className="gap-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold"
            >
              <Upload className="h-4 w-4" />
              <span>Upload Resume</span>
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // State C & D & G: Student Ready to Apply, In-flight, or Error State
  return (
    <Card
      glass
      className={`border-border/60 overflow-hidden bg-secondary/15 ${className}`}
    >
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold text-foreground">
                Apply for this Position
              </h3>
            </div>
            {primaryResume ? (
              <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span>
                  Will submit with your primary resume{' '}
                  <span className="text-foreground font-medium">
                    (Uploaded{' '}
                    {new Date(primaryResume.created_at).toLocaleDateString()})
                  </span>
                </span>
              </p>
            ) : isLoadingResumes ? (
              <p className="text-xs text-muted-foreground animate-pulse">
                Checking student resume status...
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Submit your profile and resume directly to {companyName}.
              </p>
            )}
          </div>

          <Button
            size="lg"
            variant="default"
            onClick={handleApply}
            isLoading={applyMutation.isPending}
            disabled={
              applyMutation.isPending || isLoadingResumes || !primaryResume
            }
            className="gap-2 shrink-0 w-full sm:w-auto font-semibold shadow-md shadow-primary/20"
          >
            <Send className="h-4 w-4" />
            <span>
              {applyMutation.isPending
                ? 'Submitting Application...'
                : 'Apply Now'}
            </span>
          </Button>
        </div>

        {/* Error Feedback Banner */}
        {errorMessage && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 flex items-start gap-3 text-xs sm:text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span>{errorMessage}</span>
              {isRetryable && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleApply}
                  className="h-7 text-xs gap-1 border-destructive/40 hover:bg-destructive/10 self-start sm:self-auto"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Retry</span>
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Resume Fetch Error Banner */}
        {isResumeError && (
          <div className="p-3 rounded-lg bg-secondary/30 border border-border/50 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Unable to load your resume list.</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchResumes()}
              className="h-6 text-xs gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Retry</span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
