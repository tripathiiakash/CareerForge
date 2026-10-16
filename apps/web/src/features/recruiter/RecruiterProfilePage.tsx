import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import {
  updateRecruiterProfileSchema,
  UpdateRecruiterProfileInput,
  submitRecruiterOrganizationSchema,
  SubmitRecruiterOrganizationInput,
} from '@careerforge/validation';
import { useAuth } from '@/auth/AuthContext';
import {
  useRecruiterProfile,
  useUpdateRecruiterProfile,
  useRecruiterOrganization,
  useSubmitRecruiterOrganization,
  useUploadRecruiterEvidence,
} from './hooks';
import { extractApiError } from '@/lib/api';
import { getRecruiterEvidenceDownloadUrl } from './recruiterApi';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  User,
  Building2,
  Mail,
  Globe,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Save,
  ShieldCheck,
  Clock,
  ExternalLink,
  FileText,
  UploadCloud,
  Download,
  AlertTriangle,
  Briefcase,
  Linkedin,
} from 'lucide-react';
import {
  RecruiterProfileFormValues,
  RecruiterOrganizationFormValues,
  VerificationStatus,
} from './types';

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  if (bytes < k) return `${bytes} B`;
  const kb = bytes / k;
  if (kb < k) return `${kb.toFixed(1)} KB`;
  return `${(kb / k).toFixed(2)} MB`;
}

export const RecruiterProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { data: profile, isLoading, isError, refetch } = useRecruiterProfile();
  const {
    data: verification,
    isLoading: isVerificationLoading,
    refetch: refetchVerification,
  } = useRecruiterOrganization();

  const updateMutation = useUpdateRecruiterProfile();
  const submitOrgMutation = useSubmitRecruiterOrganization();
  const uploadEvidenceMutation = useUploadRecruiterEvidence();

  const [isEditing, setIsEditing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [serverError, setServerError] = useState<{
    code: string;
    message: string;
  } | null>(null);

  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [orgSaveSuccess, setOrgSaveSuccess] = useState(false);
  const [orgServerError, setOrgServerError] = useState<{
    code: string;
    message: string;
  } | null>(null);

  const [evidenceUploadSuccess, setEvidenceUploadSuccess] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RecruiterProfileFormValues>({
    defaultValues: {
      first_name: '',
      last_name: '',
    },
  });

  const {
    register: registerOrg,
    handleSubmit: handleSubmitOrg,
    reset: resetOrg,
    formState: { errors: orgErrors, isSubmitting: isSubmittingOrg },
  } = useForm<RecruiterOrganizationFormValues>({
    defaultValues: {
      organization_name: '',
      website_url: '',
      linkedin_url: '',
      designation: '',
      description: '',
    },
  });

  // Re-sync profile form when profile loads or resets
  useEffect(() => {
    if (profile) {
      reset({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
      });
    }
  }, [profile, reset]);

  // Re-sync organization form when verification data loads
  useEffect(() => {
    if (verification) {
      resetOrg({
        organization_name: verification.organization_name || '',
        website_url: verification.website_url || '',
        linkedin_url: verification.linkedin_url || '',
        designation: verification.designation || '',
        description: verification.description || '',
      });
      if (verification.status === 'NEEDS_CLARIFICATION') {
        setIsEditingOrg(true);
      }
    }
  }, [verification, resetOrg]);

  const onSubmit = async (values: RecruiterProfileFormValues) => {
    setServerError(null);
    setSaveSuccess(false);

    try {
      const payload: UpdateRecruiterProfileInput = {
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
      };

      const parseResult = updateRecruiterProfileSchema.safeParse(payload);
      if (!parseResult.success) {
        const firstIssue = parseResult.error.issues[0];
        setServerError({
          code: 'VALIDATION_ERROR',
          message: firstIssue
            ? `${firstIssue.path.join('.')}: ${firstIssue.message}`
            : 'Validation failed',
        });
        return;
      }

      await updateMutation.mutateAsync(parseResult.data);
      setSaveSuccess(true);
      setIsEditing(false);

      setTimeout(() => {
        setSaveSuccess(false);
      }, 4000);
    } catch (err: unknown) {
      const parsed = extractApiError(err);
      setServerError({
        code: parsed.code,
        message: parsed.message,
      });
    }
  };

  const handleCancelEdit = () => {
    if (profile) {
      reset({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
      });
    }
    setServerError(null);
    setIsEditing(false);
  };

  const onOrgSubmit = async (values: RecruiterOrganizationFormValues) => {
    setOrgServerError(null);
    setOrgSaveSuccess(false);

    try {
      const payload: SubmitRecruiterOrganizationInput = {
        organization_name: values.organization_name.trim(),
        website_url: values.website_url?.trim() || null,
        linkedin_url: values.linkedin_url?.trim() || null,
        designation: values.designation?.trim() || null,
        description: values.description?.trim() || null,
      };

      const parseResult = submitRecruiterOrganizationSchema.safeParse(payload);
      if (!parseResult.success) {
        const firstIssue = parseResult.error.issues[0];
        setOrgServerError({
          code: 'VALIDATION_ERROR',
          message: firstIssue
            ? `${firstIssue.path.join('.')}: ${firstIssue.message}`
            : 'Validation failed',
        });
        return;
      }

      await submitOrgMutation.mutateAsync(parseResult.data);
      setOrgSaveSuccess(true);
      setIsEditingOrg(false);

      setTimeout(() => {
        setOrgSaveSuccess(false);
      }, 4000);
    } catch (err: unknown) {
      const parsed = extractApiError(err);
      setOrgServerError({
        code: parsed.code,
        message: parsed.message,
      });
    }
  };

  const handleCancelOrgEdit = () => {
    if (verification) {
      resetOrg({
        organization_name: verification.organization_name || '',
        website_url: verification.website_url || '',
        linkedin_url: verification.linkedin_url || '',
        designation: verification.designation || '',
        description: verification.description || '',
      });
    }
    setOrgServerError(null);
    setIsEditingOrg(false);
  };

  const handleEvidenceFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setEvidenceError(null);
    setEvidenceUploadSuccess(false);
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg'];
    if (!allowedTypes.includes(file.type)) {
      setEvidenceError(
        'Invalid file type. Only PDF, PNG, and JPEG files are accepted.'
      );
      return;
    }

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      setEvidenceError(
        'File is too large. Evidence documents must not exceed 5MB.'
      );
      return;
    }

    try {
      await uploadEvidenceMutation.mutateAsync(file);
      setEvidenceUploadSuccess(true);
      setTimeout(() => setEvidenceUploadSuccess(false), 4000);
    } catch (err: unknown) {
      const parsed = extractApiError(err);
      setEvidenceError(parsed.message);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (isLoading || isVerificationLoading) {
    return (
      <div
        data-testid="loading-state"
        className="min-h-[50vh] flex flex-col items-center justify-center gap-3"
      >
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        <span className="text-sm text-muted-foreground font-medium">
          Loading recruiter profile...
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
            Unable to load recruiter profile
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          An error occurred while fetching your recruiter profile from the
          server.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refetch();
            refetchVerification();
          }}
        >
          Try Again
        </Button>
      </div>
    );
  }

  const initials =
    [profile?.first_name?.[0], profile?.last_name?.[0]]
      .filter(Boolean)
      .join('')
      .toUpperCase() || 'RC';

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  const companyInitials =
    profile?.company?.name
      ?.split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || 'CO';

  const activeStatus: VerificationStatus =
    verification?.status || (profile?.is_approved ? 'APPROVED' : 'PENDING');

  return (
    <div className="space-y-8 pb-12 max-w-5xl mx-auto animate-fade-in">
      {/* Notifications */}
      {saveSuccess && (
        <div
          data-testid="save-success-banner"
          className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 flex items-center justify-between shadow-sm animate-fade-in"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">
              Recruiter profile updated successfully!
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSaveSuccess(false)}
            className="text-emerald-400/80 hover:text-emerald-400"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {serverError && (
        <div
          data-testid="server-error-banner"
          className="p-4 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive flex items-center justify-between shadow-sm animate-fade-in"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">{serverError.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setServerError(null)}
            className="text-destructive/80 hover:text-destructive"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {orgSaveSuccess && (
        <div
          data-testid="org-save-success-banner"
          className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 flex items-center justify-between shadow-sm animate-fade-in"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">
              Organization details submitted successfully for administrator
              verification!
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOrgSaveSuccess(false)}
            className="text-emerald-400/80 hover:text-emerald-400"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {orgServerError && (
        <div
          data-testid="org-server-error-banner"
          className="p-4 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive flex items-center justify-between shadow-sm animate-fade-in"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">
              {orgServerError.message}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOrgServerError(null)}
            className="text-destructive/80 hover:text-destructive"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {evidenceUploadSuccess && (
        <div
          data-testid="evidence-success-banner"
          className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 flex items-center justify-between shadow-sm animate-fade-in"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">
              Verification evidence uploaded successfully!
            </span>
          </div>
          <button
            type="button"
            onClick={() => setEvidenceUploadSuccess(false)}
            className="text-emerald-400/80 hover:text-emerald-400"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {evidenceError && (
        <div
          data-testid="evidence-error-banner"
          className="p-4 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive flex items-center justify-between shadow-sm animate-fade-in"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">{evidenceError}</span>
          </div>
          <button
            type="button"
            onClick={() => setEvidenceError(null)}
            className="text-destructive/80 hover:text-destructive"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Recruiter Header Card */}
      <div className="p-6 sm:p-8 rounded-2xl glass-card border border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-extrabold text-xl flex items-center justify-center shadow-lg shadow-emerald-600/25 shrink-0">
            {initials}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {fullName || 'Recruiter Profile'}
              </h1>
              <Badge variant="success" className="text-xs">
                Recruiter
              </Badge>
              {activeStatus === 'APPROVED' ? (
                <Badge variant="success" className="gap-1 items-center text-xs">
                  <ShieldCheck className="h-3 w-3" />
                  <span>Verified</span>
                </Badge>
              ) : activeStatus === 'NEEDS_CLARIFICATION' ? (
                <Badge
                  variant="warning"
                  className="gap-1 items-center text-xs border-amber-500/50 bg-amber-500/20 text-amber-300"
                >
                  <AlertTriangle className="h-3 w-3" />
                  <span>Clarification Needed</span>
                </Badge>
              ) : activeStatus === 'REJECTED' ? (
                <Badge
                  variant="destructive"
                  className="gap-1 items-center text-xs"
                >
                  <AlertCircle className="h-3 w-3" />
                  <span>Application Rejected</span>
                </Badge>
              ) : (
                <Badge variant="warning" className="gap-1 items-center text-xs">
                  <Clock className="h-3 w-3" />
                  <span>Pending Approval</span>
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span>{user?.email}</span>
            </p>
          </div>
        </div>

        {!isEditing ? (
          <Button
            onClick={() => setIsEditing(true)}
            className="gap-2 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Edit3 className="h-4 w-4" />
            <span>Edit Profile</span>
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={handleCancelEdit}
            className="gap-2 shrink-0"
          >
            <X className="h-4 w-4" />
            <span>Cancel Editing</span>
          </Button>
        )}
      </div>

      {/* Main Content Area: Personal & Company */}
      {!isEditing ? (
        /* View Mode */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Identity & Personal Info */}
          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <User className="h-5 w-5 text-emerald-400" />
                <span>Personal Information</span>
              </CardTitle>
              <CardDescription>
                Hiring manager details associated with your recruiter account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Full Name
                </span>
                <p className="text-base font-medium text-foreground">
                  {fullName || (
                    <span className="text-muted-foreground italic">
                      Not specified
                    </span>
                  )}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Email Address
                </span>
                <p className="text-base font-medium text-foreground">
                  {user?.email}
                </p>
                <span className="text-xs text-muted-foreground">
                  Managed via primary login credentials.
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Account Verification Status
                </span>
                <div className="pt-1">
                  {profile?.is_approved ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-400 font-medium">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Approved Recruiter — Full Posting Access</span>
                    </div>
                  ) : activeStatus === 'NEEDS_CLARIFICATION' ? (
                    <div className="flex items-center gap-2 text-sm text-amber-300 font-medium">
                      <AlertTriangle className="h-4 w-4" />
                      <span>
                        Clarification Requested — Action required below
                      </span>
                    </div>
                  ) : activeStatus === 'REJECTED' ? (
                    <div className="flex items-center gap-2 text-sm text-destructive font-medium">
                      <AlertCircle className="h-4 w-4" />
                      <span>Application Rejected by Administrator</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-amber-400 font-medium">
                      <Clock className="h-4 w-4" />
                      <span>
                        Pending Administrator Approval — Profiles and jobs will
                        be reviewed before public listing
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Company Information */}
          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5 text-emerald-400" />
                <span>Associated Company</span>
              </CardTitle>
              <CardDescription>
                Organization represented in job requisitions and candidate
                communications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {profile?.is_company_assigned ? (
                /* Assigned state */
                <>
                  <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                    {profile.company?.logo_url ? (
                      <img
                        src={profile.company.logo_url}
                        alt={profile.company.name}
                        className="h-12 w-12 rounded-xl object-contain border border-border/60 bg-secondary/30 p-1"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold text-sm">
                        {companyInitials}
                      </div>
                    )}
                    <div className="space-y-0.5">
                      <h3 className="font-semibold text-foreground text-base">
                        {profile.company.name}
                      </h3>
                      <Badge
                        variant="success"
                        className="gap-1 items-center text-xs"
                      >
                        <ShieldCheck className="h-3 w-3" />
                        <span>Assigned</span>
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Company Website
                    </span>
                    {profile.company?.website ? (
                      <a
                        href={profile.company.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm text-foreground hover:text-emerald-400 transition-colors truncate pt-1 font-medium"
                      >
                        <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">
                          {profile.company.website}
                        </span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </a>
                    ) : (
                      <p className="text-sm text-muted-foreground italic pt-1">
                        No website listed
                      </p>
                    )}
                  </div>
                </>
              ) : (
                /* Not assigned state */
                <>
                  <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                    <div className="h-12 w-12 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                      <Building2 className="h-6 w-6" />
                    </div>
                    <div className="space-y-0.5">
                      <h3 className="font-semibold text-foreground text-base">
                        No company assigned
                      </h3>
                      <Badge
                        variant="warning"
                        className="gap-1 items-center text-xs"
                      >
                        <Clock className="h-3 w-3" />
                        <span>Not Assigned</span>
                      </Badge>
                    </div>
                  </div>

                  <div
                    data-testid="no-company-profile-info"
                    className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-2"
                  >
                    <p className="text-xs font-semibold text-amber-400">
                      Action required by administrator
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Your recruiter account has not yet been linked to an
                      authoritative company. Please complete your organization
                      verification details and evidence below so an
                      administrator can review and link your company.
                    </p>
                  </div>
                </>
              )}

              <div className="p-3 rounded-lg bg-secondary/30 border border-border/40 text-xs text-muted-foreground space-y-1">
                <span className="font-medium text-foreground block">
                  Company Organization Policy
                </span>
                <p>
                  Company affiliation is managed by platform administrators.
                  Recruiters cannot self-assign to organizations — submit your
                  organization details below for administrator review and
                  assignment.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Edit Mode Form: Personal */
        <Card glass className="border-border/80 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Edit3 className="h-5 w-5 text-emerald-400" />
              <span>Edit Recruiter Profile</span>
            </CardTitle>
            <CardDescription>
              Update your personal recruiter name. Organization details and
              account email are protected.
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardContent className="space-y-6">
              {/* Name Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="First Name *"
                  placeholder="e.g. Sarah"
                  error={errors.first_name?.message}
                  {...register('first_name', {
                    required: 'First name is required',
                    minLength: {
                      value: 1,
                      message:
                        'First name must be between 1 and 100 characters',
                    },
                    maxLength: {
                      value: 100,
                      message: 'First name cannot exceed 100 characters',
                    },
                  })}
                />

                <Input
                  label="Last Name *"
                  placeholder="e.g. Connor"
                  error={errors.last_name?.message}
                  {...register('last_name', {
                    required: 'Last name is required',
                    minLength: {
                      value: 1,
                      message: 'Last name must be between 1 and 100 characters',
                    },
                    maxLength: {
                      value: 100,
                      message: 'Last name cannot exceed 100 characters',
                    },
                  })}
                />
              </div>

              {/* Read-only Account Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5 p-3.5 rounded-lg bg-secondary/20 border border-border/40">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Account Email (Read-only)
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {user?.email}
                  </p>
                </div>

                <div className="space-y-1.5 p-3.5 rounded-lg bg-secondary/20 border border-border/40">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Company (Read-only — admin assigned)
                  </span>
                  {profile?.is_company_assigned ? (
                    <p className="text-sm font-medium text-foreground">
                      {profile.company.name}
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-amber-400">
                      Not assigned — submit verification details below
                    </p>
                  )}
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex items-center justify-end gap-3 pt-4 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelEdit}
                disabled={isSubmitting || updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={isSubmitting || updateMutation.isPending}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Save className="h-4 w-4" />
                <span>Save Profile</span>
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {/* Organization Verification & Evidence Section */}
      <Card
        glass
        data-testid="org-verification-card"
        className="border-border/70"
      >
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl flex items-center gap-2">
                <Building2 className="h-5 w-5 text-emerald-400" />
                <span>Organization Verification & Evidence</span>
              </CardTitle>
              <div data-testid="verification-status-badge">
                {activeStatus === 'APPROVED' ? (
                  <Badge variant="success" className="text-xs gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    <span>Verified</span>
                  </Badge>
                ) : activeStatus === 'NEEDS_CLARIFICATION' ? (
                  <Badge
                    variant="warning"
                    className="text-xs gap-1 border-amber-500/50 bg-amber-500/20 text-amber-300"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    <span>Clarification Requested</span>
                  </Badge>
                ) : activeStatus === 'REJECTED' ? (
                  <Badge variant="destructive" className="text-xs gap-1">
                    <AlertCircle className="h-3 w-3" />
                    <span>Rejected</span>
                  </Badge>
                ) : (
                  <Badge variant="warning" className="text-xs gap-1">
                    <Clock className="h-3 w-3" />
                    <span>Under Review</span>
                  </Badge>
                )}
              </div>
            </div>
            <CardDescription>
              Submit your company details and verification proof to receive
              authoritative company assignment and job posting privileges.
            </CardDescription>
          </div>

          {!isEditingOrg ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditingOrg(true)}
              className="gap-2 shrink-0 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
            >
              <Edit3 className="h-4 w-4" />
              <span>
                {verification?.is_submitted
                  ? 'Update Organization Details'
                  : 'Submit Organization Details'}
              </span>
            </Button>
          ) : (
            verification?.is_submitted && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelOrgEdit}
                className="gap-2 shrink-0"
              >
                <X className="h-4 w-4" />
                <span>Cancel</span>
              </Button>
            )
          )}
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* Clarification Alert Banner */}
          {activeStatus === 'NEEDS_CLARIFICATION' &&
            verification?.clarification_message && (
              <div
                data-testid="clarification-alert"
                className="p-5 rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-200 space-y-2 animate-fade-in"
              >
                <div className="flex items-center gap-2 text-amber-300 font-semibold">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <span>Administrator Clarification Requested</span>
                </div>
                <p className="text-sm bg-black/20 p-3 rounded-lg border border-amber-500/20 text-amber-100 font-mono text-xs sm:text-sm">
                  {verification.clarification_message}
                </p>
                <p className="text-xs text-amber-300/80">
                  Please update your organization details or upload additional
                  verification proof below to resolve this clarification
                  request.
                </p>
              </div>
            )}

          {/* Rejection Alert Banner */}
          {activeStatus === 'REJECTED' && verification?.rejection_reason && (
            <div
              data-testid="rejection-alert"
              className="p-5 rounded-xl border border-destructive/40 bg-destructive/15 text-destructive space-y-2 animate-fade-in"
            >
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>Verification Application Not Approved</span>
              </div>
              <p className="text-sm bg-black/20 p-3 rounded-lg border border-destructive/20 font-mono text-xs sm:text-sm">
                {verification.rejection_reason}
              </p>
              <p className="text-xs text-muted-foreground">
                You may correct your organization details and upload valid proof
                below to request another review.
              </p>
            </div>
          )}

          {/* Approved Banner */}
          {activeStatus === 'APPROVED' && (
            <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">
                  Organization Credentials Verified
                </p>
                <p className="text-xs text-emerald-400/80">
                  Your organization details have been approved by platform
                  administrators.
                </p>
              </div>
            </div>
          )}

          {/* Organization Edit Form */}
          {isEditingOrg ? (
            <form onSubmit={handleSubmitOrg(onOrgSubmit)} noValidate>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Organization Name *"
                    placeholder="e.g. Acme Corporation"
                    error={orgErrors.organization_name?.message}
                    {...registerOrg('organization_name', {
                      required: 'Organization name is required',
                      minLength: {
                        value: 2,
                        message:
                          'Organization name must be between 2 and 255 characters',
                      },
                      maxLength: {
                        value: 255,
                        message:
                          'Organization name cannot exceed 255 characters',
                      },
                    })}
                  />

                  <Input
                    label="Your Designation / Role"
                    placeholder="e.g. Senior Talent Acquisition Specialist"
                    error={orgErrors.designation?.message}
                    {...registerOrg('designation', {
                      maxLength: {
                        value: 100,
                        message: 'Designation cannot exceed 100 characters',
                      },
                    })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Company Website URL"
                    placeholder="https://example.com"
                    error={orgErrors.website_url?.message}
                    {...registerOrg('website_url', {
                      maxLength: {
                        value: 255,
                        message: 'Website URL cannot exceed 255 characters',
                      },
                    })}
                  />

                  <Input
                    label="Company LinkedIn Profile URL"
                    placeholder="https://linkedin.com/company/example"
                    error={orgErrors.linkedin_url?.message}
                    {...registerOrg('linkedin_url', {
                      maxLength: {
                        value: 255,
                        message: 'LinkedIn URL cannot exceed 255 characters',
                      },
                    })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Organization Description
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Describe your organization, industry sector, hiring focus, or company background..."
                    className="w-full rounded-xl bg-background/50 border border-border/80 px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all placeholder:text-muted-foreground resize-y"
                    {...registerOrg('description', {
                      maxLength: {
                        value: 2000,
                        message: 'Description cannot exceed 2000 characters',
                      },
                    })}
                  />
                  {orgErrors.description?.message && (
                    <p className="text-xs text-destructive">
                      {orgErrors.description.message}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-3">
                  {verification?.is_submitted && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancelOrgEdit}
                      disabled={isSubmittingOrg || submitOrgMutation.isPending}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="submit"
                    isLoading={isSubmittingOrg || submitOrgMutation.isPending}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Save className="h-4 w-4" />
                    <span>
                      {activeStatus === 'NEEDS_CLARIFICATION'
                        ? 'Resubmit Verification Details'
                        : 'Save & Submit Organization'}
                    </span>
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            /* View Mode for Organization */
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-secondary/20 border border-border/40 space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Submitted Organization Name
                  </span>
                  <p className="text-sm font-semibold text-foreground">
                    {verification?.organization_name || (
                      <span className="text-muted-foreground italic">
                        Not submitted
                      </span>
                    )}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-secondary/20 border border-border/40 space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Recruiter Designation
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {verification?.designation || (
                      <span className="text-muted-foreground italic">
                        Not specified
                      </span>
                    )}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-secondary/20 border border-border/40 space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Company Website
                  </span>
                  {verification?.website_url ? (
                    <a
                      href={verification.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-emerald-400 hover:underline font-medium truncate pt-0.5"
                    >
                      <Globe className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {verification.website_url}
                      </span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">
                      Not specified
                    </span>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-secondary/20 border border-border/40 space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Company LinkedIn
                  </span>
                  {verification?.linkedin_url ? (
                    <a
                      href={verification.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-sky-400 hover:underline font-medium truncate pt-0.5"
                    >
                      <Linkedin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {verification.linkedin_url}
                      </span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">
                      Not specified
                    </span>
                  )}
                </div>
              </div>

              {verification?.description && (
                <div className="p-4 rounded-xl bg-secondary/20 border border-border/40 space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Organization Description
                  </span>
                  <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">
                    {verification.description}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Verification Evidence Document Section */}
          <div className="pt-4 border-t border-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-emerald-400" />
                  <span>Verification Evidence Document</span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  Supporting document (e.g. Certificate of Incorporation, GST
                  registration, company ID, or official authorization letter).
                </p>
              </div>
            </div>

            {verification?.evidence_original_name ? (
              <div className="p-4 rounded-xl bg-secondary/30 border border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {verification.evidence_original_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(verification.evidence_size_bytes)} •{' '}
                      {verification.evidence_mime_type}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={getRecruiterEvidenceDownloadUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border/70 bg-secondary/50 text-foreground hover:bg-secondary transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download Evidence</span>
                  </a>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadEvidenceMutation.isPending}
                    className="gap-1.5 text-xs"
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    <span>Replace Document</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-xl border-2 border-dashed border-border/70 bg-secondary/10 flex flex-col items-center justify-center text-center gap-2">
                <UploadCloud className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  No verification evidence uploaded
                </p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Upload an official document (PDF, PNG, JPEG up to 5MB) to
                  expedite your account verification.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadEvidenceMutation.isPending}
                  className="mt-2 gap-1.5 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                >
                  {uploadEvidenceMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UploadCloud className="h-3.5 w-3.5" />
                  )}
                  <span>Upload Document</span>
                </Button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              onChange={handleEvidenceFileChange}
              className="hidden"
              data-testid="evidence-file-input"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
