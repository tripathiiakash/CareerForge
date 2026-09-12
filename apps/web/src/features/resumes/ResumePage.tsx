import React from 'react';
import { FileText, AlertCircle, RefreshCw, Info, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { extractApiError } from '@/lib/api';
import { useStudentResumes } from './hooks';
import { ResumeCard } from './components/ResumeCard';
import { ResumeUpload } from './components/ResumeUpload';

export const ResumePage: React.FC = () => {
  const {
    data: resumes = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useStudentResumes();

  const primaryResume = resumes.find((r) => r.is_primary) || resumes[0];
  const otherResumes = resumes.filter((r) => r.id !== primaryResume?.id);

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Resume Management
            </h1>
            <Badge variant="secondary" className="font-mono text-xs">
              PDF Resumes
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Upload and view your PDF resumes. Your primary resume is
            automatically submitted when you apply for jobs.
          </p>
        </div>

        {resumes.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs py-1 px-2.5">
              {resumes.length} {resumes.length === 1 ? 'Resume' : 'Resumes'} on
              file
            </Badge>
          </div>
        )}
      </div>

      {/* Application Connection Explanatory Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground/90">
        <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">
            How your primary resume works with job applications
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            When applying to jobs on CareerForge, your active{' '}
            <strong className="text-foreground font-semibold">
              Primary Resume
            </strong>{' '}
            is automatically attached. Each new resume you upload automatically
            becomes your primary resume.
          </p>
        </div>
      </div>

      {/* Grid Layout: Upload section + Resumes List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Upload Component (5 cols on large screens) */}
        <div className="lg:col-span-5 space-y-6">
          <ResumeUpload />

          {/* Feature Notes */}
          <Card glass className="border-border/60">
            <CardContent className="p-4 space-y-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-purple-400" />
                <span>Resume Processing</span>
              </div>
              <p>
                Every uploaded resume undergoes automatic text extraction so
                recruiters can search skills and qualifications.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Resumes List & States (7 cols on large screens) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Loading Skeleton */}
          {isLoading && (
            <div className="space-y-4">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="rounded-xl border border-border/50 bg-secondary/20 p-6 animate-pulse space-y-3"
                >
                  <div className="h-5 w-2/3 bg-secondary rounded" />
                  <div className="h-4 w-1/3 bg-secondary/80 rounded" />
                </div>
              ))}
            </div>
          )}

          {/* Error State */}
          {!isLoading && isError && (
            <Card
              glass
              className="border-destructive/30 bg-destructive/5 text-center p-8"
            >
              <div className="flex flex-col items-center gap-3">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <h3 className="text-lg font-semibold text-foreground">
                  Unable to load your resumes
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  {extractApiError(error).message}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  className="mt-2 gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Try Again</span>
                </Button>
              </div>
            </Card>
          )}

          {/* Empty State */}
          {!isLoading && !isError && resumes.length === 0 && (
            <Card
              glass
              className="border-dashed border-border/80 p-8 text-center"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  No resumes uploaded yet
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  You have not uploaded any resumes yet. Upload your PDF resume
                  using the form to start applying for jobs across the platform.
                </p>
              </div>
            </Card>
          )}

          {/* Populated Resumes List */}
          {!isLoading && !isError && resumes.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Your Resumes ({resumes.length})
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetch()}
                  className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Refresh</span>
                </Button>
              </div>

              {/* Primary Resume Card First */}
              {primaryResume && (
                <div className="space-y-1.5">
                  <ResumeCard resume={primaryResume} />
                </div>
              )}

              {/* Older Resumes */}
              {otherResumes.length > 0 && (
                <div className="pt-2 space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Previous Versions
                  </h3>
                  {otherResumes.map((resume) => (
                    <ResumeCard key={resume.id} resume={resume} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
