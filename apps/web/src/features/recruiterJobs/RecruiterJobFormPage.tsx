import React, { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  AlertCircle,
  Loader2,
  Building2,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { JobForm } from './components/JobForm';
import { useCreateJob, useJobDetail, useUpdateJob } from './hooks';
import { useRecruiterProfile } from '@/features/recruiter';
import { EmploymentType } from './types';
import { extractApiError } from '@/lib/api';
import { createJobSchema, updateJobSchema } from '@careerforge/validation';

interface RecruiterJobFormPageProps {
  mode: 'create' | 'edit';
}

export const RecruiterJobFormPage: React.FC<RecruiterJobFormPageProps> = ({
  mode,
}) => {
  const navigate = useNavigate();
  const { jobId } = useParams<{ jobId: string }>();

  const { data: recruiterProfile } = useRecruiterProfile();
  const {
    data: existingJob,
    isLoading: isLoadingJob,
    isError: isErrorJob,
  } = useJobDetail(jobId || '');

  const createMutation = useCreateJob();
  const updateMutation = useUpdateJob();

  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (data: {
    title: string;
    description: string;
    required_skills: string[];
    employment_type: EmploymentType;
  }) => {
    setFormError(null);

    try {
      if (mode === 'create') {
        const schemaResult = createJobSchema.safeParse(data);
        if (!schemaResult.success) {
          const firstIssue = schemaResult.error.issues[0];
          setFormError(firstIssue ? firstIssue.message : 'Validation failed');
          return;
        }

        await createMutation.mutateAsync(schemaResult.data);
        navigate('/recruiter/jobs');
      } else if (mode === 'edit' && jobId) {
        const schemaResult = updateJobSchema.safeParse(data);
        if (!schemaResult.success) {
          const firstIssue = schemaResult.error.issues[0];
          setFormError(firstIssue ? firstIssue.message : 'Validation failed');
          return;
        }

        await updateMutation.mutateAsync({
          jobId,
          dto: schemaResult.data,
        });
        navigate('/recruiter/jobs');
      }
    } catch (err: unknown) {
      const parsed = extractApiError(err);
      setFormError(parsed.message || 'Operation failed. Please try again.');
    }
  };

  if (mode === 'edit' && isLoadingJob) {
    return (
      <div
        data-testid="loading-state"
        className="min-h-[50vh] flex flex-col items-center justify-center gap-3"
      >
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        <span className="text-sm text-muted-foreground font-medium">
          Loading job requisition details...
        </span>
      </div>
    );
  }

  if (mode === 'edit' && (isErrorJob || !existingJob)) {
    return (
      <div
        data-testid="error-state"
        className="p-6 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive space-y-4 max-w-2xl mx-auto"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <h2 className="font-semibold text-lg">
            Job Not Found or Access Denied
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          The requested job posting either does not exist or you do not have
          authorization to edit it.
        </p>
        <Link to="/recruiter/jobs">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Job Openings</span>
          </Button>
        </Link>
      </div>
    );
  }

  const hasNoCompany =
    mode === 'create' &&
    recruiterProfile &&
    (!recruiterProfile.company || !recruiterProfile.company.name);

  return (
    <div className="space-y-6 pb-12 max-w-3xl mx-auto animate-fade-in">
      {/* Back Link */}
      <div>
        <Link
          to="/recruiter/jobs"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Job Openings</span>
        </Link>
      </div>

      {/* No Company Warning */}
      {hasNoCompany && (
        <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400 space-y-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="text-sm font-semibold">
              Company Association Required
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your recruiter account must have a linked company before publishing
            jobs. Please ensure your profile is associated with a registered
            organization.
          </p>
        </div>
      )}

      {/* Error Alert */}
      {formError && (
        <div
          data-testid="form-error-banner"
          className="p-4 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive flex items-center gap-2.5 shadow-sm animate-fade-in"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">{formError}</span>
        </div>
      )}

      {/* Form Card */}
      <Card glass className="border-border/80 shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            <Briefcase className="h-4 w-4" />
            <span>
              {mode === 'create' ? 'New Requisition' : 'Edit Requisition'}
            </span>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {mode === 'create'
              ? 'Post a New Job Role'
              : `Edit: ${existingJob?.title}`}
          </CardTitle>
          <CardDescription>
            {mode === 'create'
              ? 'Provide clear role details and requirements to match with qualified student candidates.'
              : 'Update the job specifications, required technical competencies, or role description.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <JobForm
            initialValues={
              mode === 'edit' && existingJob
                ? {
                    title: existingJob.title,
                    description: existingJob.description,
                    required_skills:
                      existingJob.required_skills?.join(', ') || '',
                    employment_type:
                      existingJob.employment_type as EmploymentType,
                  }
                : undefined
            }
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending || updateMutation.isPending}
            submitLabel={
              mode === 'create' ? 'Publish Job Requisition' : 'Save Changes'
            }
            onCancel={() => navigate('/recruiter/jobs')}
          />
        </CardContent>
      </Card>
    </div>
  );
};
