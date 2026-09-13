import React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmploymentType, JobFormData } from '../types';
import { Briefcase, FileText, Tag, Check, Sparkles } from 'lucide-react';

interface JobFormProps {
  initialValues?: Partial<JobFormData>;
  onSubmit: (data: {
    title: string;
    description: string;
    required_skills: string[];
    employment_type: EmploymentType;
  }) => Promise<void>;
  isSubmitting: boolean;
  submitLabel: string;
  onCancel: () => void;
}

export const JobForm: React.FC<JobFormProps> = ({
  initialValues,
  onSubmit,
  isSubmitting,
  submitLabel,
  onCancel,
}) => {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<JobFormData>({
    defaultValues: {
      title: initialValues?.title || '',
      description: initialValues?.description || '',
      required_skills: initialValues?.required_skills || '',
      employment_type: initialValues?.employment_type || 'FULL_TIME',
    },
  });

  const watchedSkills = watch('required_skills');
  const watchedDescription = watch('description') || '';
  const watchedEmploymentType = watch('employment_type');

  const parsedSkills = (watchedSkills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const handleFormSubmit = async (values: JobFormData) => {
    const cleanedSkills = (values.required_skills || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    await onSubmit({
      title: values.title.trim(),
      description: values.description.trim(),
      required_skills: cleanedSkills,
      employment_type: values.employment_type,
    });
  };

  return (
    <form
      onSubmit={handleSubmit(handleFormSubmit)}
      noValidate
      className="space-y-6"
    >
      {/* Title */}
      <Input
        label="Job Title *"
        placeholder="e.g. Senior Frontend Engineer"
        error={errors.title?.message}
        {...register('title', {
          required: 'Job title is required',
          minLength: {
            value: 3,
            message: 'Title must be at least 3 characters',
          },
          maxLength: {
            value: 255,
            message: 'Title cannot exceed 255 characters',
          },
        })}
      />

      {/* Employment Type Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <Briefcase className="h-4 w-4 text-emerald-400" />
          <span>Employment Type *</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setValue('employment_type', 'FULL_TIME')}
            className={`p-3.5 rounded-xl border text-sm font-medium flex items-center justify-between transition-all ${
              watchedEmploymentType === 'FULL_TIME'
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-sm'
                : 'border-border/60 bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            <span>Full-Time Role</span>
            {watchedEmploymentType === 'FULL_TIME' && (
              <Check className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setValue('employment_type', 'INTERNSHIP')}
            className={`p-3.5 rounded-xl border text-sm font-medium flex items-center justify-between transition-all ${
              watchedEmploymentType === 'INTERNSHIP'
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-sm'
                : 'border-border/60 bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            <span>Internship Position</span>
            {watchedEmploymentType === 'INTERNSHIP' && (
              <Check className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Required Skills */}
      <div className="space-y-2">
        <Input
          label="Required Skills (comma-separated) *"
          placeholder="e.g. React, TypeScript, Node.js, Tailwind CSS"
          helperText="Enter 1 to 20 skills separated by commas"
          error={errors.required_skills?.message}
          {...register('required_skills', {
            required: 'At least one required skill is required',
            validate: (v) => {
              if (!v || v.trim().length === 0) {
                return 'At least one required skill is required';
              }
              const skills = v
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              if (skills.length === 0) {
                return 'At least one required skill is required';
              }
              if (skills.length > 20) {
                return 'Required skills cannot exceed 20 items';
              }
              for (const skill of skills) {
                if (skill.length > 50) {
                  return 'Each skill cannot exceed 50 characters';
                }
              }
              return true;
            },
          })}
        />

        {parsedSkills.length > 0 && (
          <div className="p-3 rounded-lg bg-secondary/30 border border-border/40 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span className="flex items-center gap-1">
                <Tag className="h-3.5 w-3.5 text-emerald-400" />
                <span>Skills Preview ({parsedSkills.length}/20):</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {parsedSkills.map((skill, idx) => (
                <Badge
                  key={idx}
                  variant="secondary"
                  className="capitalize text-xs bg-secondary/60"
                >
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="job-description"
            className="text-sm font-medium text-foreground flex items-center gap-1.5"
          >
            <FileText className="h-4 w-4 text-emerald-400" />
            <span>Job Description *</span>
          </label>
          <span
            className={`text-xs ${
              watchedDescription.length < 50
                ? 'text-amber-400'
                : watchedDescription.length > 10000
                  ? 'text-destructive'
                  : 'text-muted-foreground'
            }`}
          >
            {watchedDescription.length} / 10,000 characters (min 50)
          </span>
        </div>

        <textarea
          id="job-description"
          rows={7}
          placeholder="Describe the responsibilities, project scope, requirements, and benefits..."
          className={`w-full rounded-xl border bg-background/50 px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all ${
            errors.description ? 'border-destructive' : 'border-input'
          }`}
          {...register('description', {
            required: 'Job description is required',
            minLength: {
              value: 50,
              message: 'Description must be at least 50 characters',
            },
            maxLength: {
              value: 10000,
              message: 'Description cannot exceed 10000 characters',
            },
          })}
        />
        {errors.description && (
          <p className="text-xs text-destructive mt-1">
            {errors.description.message}
          </p>
        )}
      </div>

      {/* Moderation Note */}
      <div className="p-3.5 rounded-xl bg-secondary/30 border border-border/50 text-xs text-muted-foreground flex items-start gap-2.5">
        <Sparkles className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-semibold text-foreground block">
            Publication Policy
          </span>
          <p>
            Newly created or updated requisitions undergo administrative review
            before appearing on the public student job board.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/50">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          isLoading={isSubmitting}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
};
