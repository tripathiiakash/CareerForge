import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  updateRecruiterProfileSchema,
  UpdateRecruiterProfileInput,
} from '@careerforge/validation';
import { useAuth } from '@/auth/AuthContext';
import { useRecruiterProfile, useUpdateRecruiterProfile } from './hooks';
import { extractApiError } from '@/lib/api';
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
} from 'lucide-react';
import { RecruiterProfileFormValues } from './types';

export const RecruiterProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { data: profile, isLoading, isError, refetch } = useRecruiterProfile();
  const updateMutation = useUpdateRecruiterProfile();

  const [isEditing, setIsEditing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [serverError, setServerError] = useState<{
    code: string;
    message: string;
  } | null>(null);

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

  // Re-sync form when profile loads or resets
  useEffect(() => {
    if (profile) {
      reset({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
      });
    }
  }, [profile, reset]);

  const onSubmit = async (values: RecruiterProfileFormValues) => {
    setServerError(null);
    setSaveSuccess(false);

    try {
      const payload: UpdateRecruiterProfileInput = {
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
      };

      // Validate payload against shared Zod schema before sending
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

  if (isLoading) {
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
        <Button variant="outline" size="sm" onClick={() => refetch()}>
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
              {profile?.is_approved ? (
                <Badge variant="success" className="gap-1 items-center text-xs">
                  <ShieldCheck className="h-3 w-3" />
                  <span>Verified</span>
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

      {/* Main Content Area */}
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
              <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                {profile?.company?.logo_url ? (
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
                    {profile?.company?.name || 'Unassigned Company'}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    Verified Organization Entity
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Company Website
                </span>
                {profile?.company?.website ? (
                  <a
                    href={profile.company.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-foreground hover:text-emerald-400 transition-colors truncate pt-1 font-medium"
                  >
                    <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{profile.company.website}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground italic pt-1">
                    No website listed
                  </p>
                )}
              </div>

              <div className="p-3 rounded-lg bg-secondary/30 border border-border/40 text-xs text-muted-foreground space-y-1">
                <span className="font-medium text-foreground block">
                  Company Organization Policy
                </span>
                <p>
                  Company affiliation is bound to organizational records.
                  Changes to legal entity details are administered through
                  verified organization support.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Edit Mode Form */
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
                    Company Name (Read-only)
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {profile?.company?.name || 'N/A'}
                  </p>
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
    </div>
  );
};
