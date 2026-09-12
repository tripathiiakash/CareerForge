import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  updateStudentProfileSchema,
  UpdateStudentProfileInput,
} from '@careerforge/validation';
import { useAuth } from '@/auth/AuthContext';
import { useStudentProfile, useUpdateStudentProfile } from './hooks';
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
  GraduationCap,
  Calendar,
  Building,
  Github,
  Linkedin,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Save,
  Tag,
} from 'lucide-react';

interface ProfileFormFields {
  first_name: string;
  last_name: string;
  university?: string;
  graduation_year?: string | number;
  degree?: string;
  skills?: string;
  github_url?: string;
  linkedin_url?: string;
}

export const StudentProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { data: profile, isLoading, isError, refetch } = useStudentProfile();
  const updateMutation = useUpdateStudentProfile();

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
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormFields>({
    defaultValues: {
      first_name: '',
      last_name: '',
      university: '',
      graduation_year: '',
      degree: '',
      skills: '',
      github_url: '',
      linkedin_url: '',
    },
  });

  // Re-sync form when profile loads or resets
  useEffect(() => {
    if (profile) {
      reset({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        university: profile.university || '',
        graduation_year: profile.graduation_year || '',
        degree: profile.degree || '',
        skills: profile.skills ? profile.skills.join(', ') : '',
        github_url: profile.github_url || '',
        linkedin_url: profile.linkedin_url || '',
      });
    }
  }, [profile, reset]);

  const watchedSkills = watch('skills');
  const parsedSkillBadges = (watchedSkills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const onSubmit = async (values: ProfileFormFields) => {
    setServerError(null);
    setSaveSuccess(false);

    try {
      // Clean and sanitize form values to match UpdateStudentProfileInput backend expectations
      const skillsArray = (values.skills || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const payload: UpdateStudentProfileInput = {
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        university: values.university?.trim() || null,
        degree: values.degree?.trim() || null,
        graduation_year: values.graduation_year
          ? Number(values.graduation_year)
          : null,
        skills: skillsArray.length > 0 ? skillsArray : undefined,
        github_url: values.github_url?.trim() || null,
        linkedin_url: values.linkedin_url?.trim() || null,
      };

      // Validate payload against shared Zod schema before sending
      const parseResult = updateStudentProfileSchema.safeParse(payload);
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
        university: profile.university || '',
        graduation_year: profile.graduation_year || '',
        degree: profile.degree || '',
        skills: profile.skills ? profile.skills.join(', ') : '',
        github_url: profile.github_url || '',
        linkedin_url: profile.linkedin_url || '',
      });
    }
    setServerError(null);
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground font-medium">
          Loading profile...
        </span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive space-y-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <h2 className="font-semibold text-lg">Unable to load profile</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          An error occurred while fetching your profile from the server.
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
      .toUpperCase() || 'ST';

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return (
    <div className="space-y-8 pb-12 max-w-5xl mx-auto animate-fade-in">
      {/* Notifications */}
      {saveSuccess && (
        <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">
              Profile updated successfully!
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSaveSuccess(false)}
            className="text-emerald-400/80 hover:text-emerald-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {serverError && (
        <div className="p-4 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">{serverError.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setServerError(null)}
            className="text-destructive/80 hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Profile Header Card */}
      <div className="p-6 sm:p-8 rounded-2xl glass-card border border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-primary to-purple-600 text-white font-extrabold text-xl flex items-center justify-center shadow-lg shadow-primary/25 shrink-0">
            {initials}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {fullName || 'Student Profile'}
              </h1>
              <Badge variant="info" className="text-xs">
                Candidate
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        {!isEditing ? (
          <Button onClick={() => setIsEditing(true)} className="gap-2 shrink-0">
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

      {/* Main Profile Content: View vs Edit Mode */}
      {!isEditing ? (
        /* View Mode */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Education Details */}
          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <GraduationCap className="h-5 w-5 text-primary" />
                <span>Education Background</span>
              </CardTitle>
              <CardDescription>
                Academic institution and degree credentials.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  University / College
                </span>
                <p className="text-base font-medium text-foreground">
                  {profile?.university || (
                    <span className="text-muted-foreground italic">
                      Not specified
                    </span>
                  )}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Degree / Program
                </span>
                <p className="text-base font-medium text-foreground">
                  {profile?.degree || (
                    <span className="text-muted-foreground italic">
                      Not specified
                    </span>
                  )}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Graduation Year
                </span>
                <p className="text-base font-medium text-foreground">
                  {profile?.graduation_year ? (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-primary" />
                      Class of {profile.graduation_year}
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">
                      Not specified
                    </span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Social & Portfolio Links */}
          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building className="h-5 w-5 text-primary" />
                <span>Links & Online Presence</span>
              </CardTitle>
              <CardDescription>
                Direct profiles accessible by verified recruiters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  GitHub Profile
                </span>
                {profile?.github_url ? (
                  <a
                    href={profile.github_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors truncate pt-1"
                  >
                    <Github className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{profile.github_url}</span>
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground italic pt-1">
                    No GitHub profile linked
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  LinkedIn Profile
                </span>
                {profile?.linkedin_url ? (
                  <a
                    href={profile.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors truncate pt-1"
                  >
                    <Linkedin className="h-4 w-4 shrink-0 text-sky-400" />
                    <span className="truncate">{profile.linkedin_url}</span>
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground italic pt-1">
                    No LinkedIn profile linked
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Skills Section (Full Width) */}
          <Card glass className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Tag className="h-5 w-5 text-primary" />
                <span>
                  Technical & Core Skills ({profile?.skills?.length || 0})
                </span>
              </CardTitle>
              <CardDescription>
                Verified competencies matched against job requirements.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profile?.skills && profile.skills.length > 0 ? (
                <div className="flex flex-wrap gap-2.5">
                  {profile.skills.map((skill) => (
                    <Badge
                      key={skill}
                      variant="secondary"
                      className="px-3 py-1 text-xs capitalize font-medium"
                    >
                      {skill}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-muted-foreground border border-dashed border-border/60 rounded-xl space-y-2">
                  <p className="text-sm italic">
                    No technical skills added yet.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                  >
                    Add Skills Now
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Edit Mode Form */
        <Card glass className="border-border/80 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Edit3 className="h-5 w-5 text-primary" />
              <span>Edit Student Profile</span>
            </CardTitle>
            <CardDescription>
              Update your biographical details, academic background, skills, and
              portfolio links.
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardContent className="space-y-6">
              {/* Name Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="First Name *"
                  placeholder="e.g. Rahul"
                  error={errors.first_name?.message}
                  {...register('first_name', {
                    required: 'First name is required',
                    minLength: {
                      value: 1,
                      message: 'Must be at least 1 character',
                    },
                    maxLength: {
                      value: 100,
                      message: 'Cannot exceed 100 characters',
                    },
                  })}
                />

                <Input
                  label="Last Name *"
                  placeholder="e.g. Sharma"
                  error={errors.last_name?.message}
                  {...register('last_name', {
                    required: 'Last name is required',
                    minLength: {
                      value: 1,
                      message: 'Must be at least 1 character',
                    },
                    maxLength: {
                      value: 100,
                      message: 'Cannot exceed 100 characters',
                    },
                  })}
                />
              </div>

              {/* Education Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <Input
                    label="University / College"
                    placeholder="e.g. National Institute of Technology"
                    error={errors.university?.message}
                    {...register('university', {
                      maxLength: {
                        value: 255,
                        message: 'Cannot exceed 255 characters',
                      },
                    })}
                  />
                </div>

                <div>
                  <Input
                    label="Graduation Year"
                    type="number"
                    placeholder="e.g. 2025"
                    helperText="Between 2000 and 2035"
                    error={errors.graduation_year?.message}
                    {...register('graduation_year', {
                      validate: (v) => {
                        if (!v) return true;
                        const num = Number(v);
                        if (isNaN(num) || num < 2000 || num > 2035) {
                          return 'Year must be between 2000 and 2035';
                        }
                        return true;
                      },
                    })}
                  />
                </div>
              </div>

              <Input
                label="Degree / Major"
                placeholder="e.g. B.Tech Computer Science & Engineering"
                error={errors.degree?.message}
                {...register('degree', {
                  maxLength: {
                    value: 100,
                    message: 'Cannot exceed 100 characters',
                  },
                })}
              />

              {/* Skills Field */}
              <div className="space-y-2">
                <Input
                  label="Technical Skills (comma-separated)"
                  placeholder="e.g. React, TypeScript, Node.js, PostgreSQL, Docker"
                  helperText="Enter skills separated by commas (max 30 skills)"
                  error={errors.skills?.message}
                  {...register('skills', {
                    validate: (v) => {
                      if (!v) return true;
                      const count = v
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean).length;
                      if (count > 30) return 'Skills cannot exceed 30 items';
                      return true;
                    },
                  })}
                />

                {parsedSkillBadges.length > 0 && (
                  <div className="p-3 rounded-lg bg-secondary/30 border border-border/40 space-y-1.5">
                    <span className="text-xs text-muted-foreground block font-medium">
                      Skills Preview:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {parsedSkillBadges.map((badge, idx) => (
                        <Badge
                          key={idx}
                          variant="secondary"
                          className="capitalize text-xs"
                        >
                          {badge}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Social / Portfolio URLs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="GitHub Profile URL"
                  type="url"
                  placeholder="https://github.com/username"
                  error={errors.github_url?.message}
                  {...register('github_url', {
                    validate: (v) => {
                      if (!v || v.trim() === '') return true;
                      try {
                        new URL(v);
                        return true;
                      } catch {
                        return 'Must be a valid URL format';
                      }
                    },
                  })}
                />

                <Input
                  label="LinkedIn Profile URL"
                  type="url"
                  placeholder="https://linkedin.com/in/username"
                  error={errors.linkedin_url?.message}
                  {...register('linkedin_url', {
                    validate: (v) => {
                      if (!v || v.trim() === '') return true;
                      try {
                        new URL(v);
                        return true;
                      } catch {
                        return 'Must be a valid URL format';
                      }
                    },
                  })}
                />
              </div>
            </CardContent>

            <CardFooter className="flex items-center justify-end gap-3 pt-4 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelEdit}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={isSubmitting || updateMutation.isPending}
                className="gap-2"
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
