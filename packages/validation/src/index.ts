import { z } from 'zod';

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Must be a valid email format')
    .max(255, 'Email cannot exceed 255 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters')
    .regex(/[0-9]/, 'Password must contain at least 1 number')
    .regex(
      /[^a-zA-Z0-9]/,
      'Password must contain at least 1 special character'
    ),
  role: z.enum(['STUDENT', 'RECRUITER'], {
    message: "Role must be exactly 'STUDENT' or 'RECRUITER'",
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Must be a valid email format')
    .max(255, 'Email cannot exceed 255 characters'),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(72, 'Password cannot exceed 72 characters'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const updateStudentProfileSchema = z.object({
  first_name: z
    .string()
    .trim()
    .min(1, 'First name must be between 1 and 100 characters')
    .max(100, 'First name cannot exceed 100 characters')
    .optional(),
  last_name: z
    .string()
    .trim()
    .min(1, 'Last name must be between 1 and 100 characters')
    .max(100, 'Last name cannot exceed 100 characters')
    .optional(),
  university: z
    .string()
    .trim()
    .max(255, 'University cannot exceed 255 characters')
    .nullable()
    .optional(),
  graduation_year: z
    .number({ message: 'Graduation year must be a valid number' })
    .int('Graduation year must be an integer')
    .min(2000, 'Graduation year must be between 2000 and 2035')
    .max(2035, 'Graduation year must be between 2000 and 2035')
    .nullable()
    .optional(),
  degree: z
    .string()
    .trim()
    .max(100, 'Degree cannot exceed 100 characters')
    .nullable()
    .optional(),
  skills: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'Skill cannot be empty')
        .max(50, 'Each skill cannot exceed 50 characters')
    )
    .max(30, 'Skills cannot exceed 30 items')
    .transform((items) =>
      Array.from(new Set(items.map((s) => s.toLowerCase())))
    )
    .optional(),
  github_url: z
    .string()
    .trim()
    .url('Must be a valid URL format')
    .max(255, 'GitHub URL cannot exceed 255 characters')
    .nullable()
    .optional(),
  linkedin_url: z
    .string()
    .trim()
    .url('Must be a valid URL format')
    .max(255, 'LinkedIn URL cannot exceed 255 characters')
    .nullable()
    .optional(),
});

export type UpdateStudentProfileInput = z.infer<
  typeof updateStudentProfileSchema
>;

export const updateRecruiterProfileSchema = z.object({
  first_name: z
    .string()
    .trim()
    .min(1, 'First name must be between 1 and 100 characters')
    .max(100, 'First name cannot exceed 100 characters')
    .optional(),
  last_name: z
    .string()
    .trim()
    .min(1, 'Last name must be between 1 and 100 characters')
    .max(100, 'Last name cannot exceed 100 characters')
    .optional(),
  company_id: z.string().uuid('Must be a valid UUID format').optional(),
});

export type UpdateRecruiterProfileInput = z.infer<
  typeof updateRecruiterProfileSchema
>;

export const createCompanySchema = z.object({
  name: z
    .string({ message: 'Company name is required' })
    .trim()
    .min(2, 'Company name must be between 2 and 255 characters')
    .max(255, 'Company name cannot exceed 255 characters'),
  website: z
    .string()
    .trim()
    .url('Must be a valid URL format')
    .max(255, 'Website URL cannot exceed 255 characters')
    .nullable()
    .optional(),
  logo_url: z
    .string()
    .trim()
    .url('Must be a valid URL format')
    .max(512, 'Logo URL cannot exceed 512 characters')
    .nullable()
    .optional(),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const aiResumeAnalysisOutputSchema = z.object({
  score: z
    .number({ message: 'Score must be a number' })
    .int('Score must be an integer')
    .min(0, 'Score cannot be less than 0')
    .max(100, 'Score cannot exceed 100'),
  missing_skills: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'Skill cannot be empty')
        .max(80, 'Skill cannot exceed 80 characters')
    )
    .max(20, 'Missing skills cannot exceed 20 items'),
  formatting_tips: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'Formatting tip cannot be empty')
        .max(300, 'Formatting tip cannot exceed 300 characters')
    )
    .max(10, 'Formatting tips cannot exceed 10 items'),
});

export type AiResumeAnalysisOutput = z.infer<
  typeof aiResumeAnalysisOutputSchema
>;

export const createJobSchema = z.object({
  title: z
    .string({ message: 'Title is required' })
    .trim()
    .min(3, 'Title must be between 3 and 255 characters')
    .max(255, 'Title cannot exceed 255 characters'),
  description: z
    .string({ message: 'Description is required' })
    .trim()
    .min(50, 'Description must be at least 50 characters')
    .max(10000, 'Description cannot exceed 10000 characters'),
  required_skills: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'Skill cannot be empty')
        .max(50, 'Each skill cannot exceed 50 characters'),
      { message: 'Required skills must be an array' }
    )
    .min(1, 'At least 1 required skill is required')
    .max(20, 'Required skills cannot exceed 20 items'),
  employment_type: z.enum(['INTERNSHIP', 'FULL_TIME'], {
    message: "Employment type must be exactly 'INTERNSHIP' or 'FULL_TIME'",
  }),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;

export const updateJobSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, 'Title must be between 3 and 255 characters')
      .max(255, 'Title cannot exceed 255 characters')
      .optional(),
    description: z
      .string()
      .trim()
      .min(50, 'Description must be at least 50 characters')
      .max(10000, 'Description cannot exceed 10000 characters')
      .optional(),
    required_skills: z
      .array(
        z
          .string()
          .trim()
          .min(1, 'Skill cannot be empty')
          .max(50, 'Each skill cannot exceed 50 characters'),
        { message: 'Required skills must be an array' }
      )
      .min(1, 'At least 1 required skill is required')
      .max(20, 'Required skills cannot exceed 20 items')
      .optional(),
    employment_type: z
      .enum(['INTERNSHIP', 'FULL_TIME'], {
        message: "Employment type must be exactly 'INTERNSHIP' or 'FULL_TIME'",
      })
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type UpdateJobInput = z.infer<typeof updateJobSchema>;

export const listJobsQuerySchema = z.object({
  page: z.coerce
    .number({ message: 'Page must be a valid number' })
    .int('Page must be an integer')
    .min(1, 'Page must be at least 1')
    .default(1),
  limit: z.coerce
    .number({ message: 'Limit must be a valid number' })
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(50, 'Limit cannot exceed 50')
    .default(10),
  search: z.string().trim().max(255).optional(),
  skills: z.string().trim().max(500).optional(),
  employment_type: z
    .enum(['INTERNSHIP', 'FULL_TIME'], {
      message: "Employment type must be exactly 'INTERNSHIP' or 'FULL_TIME'",
    })
    .optional(),
});

export type ListJobsQueryInput = z.infer<typeof listJobsQuerySchema>;

export const moderateJobStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'REJECTED'], {
      message: "Status must be exactly 'ACTIVE' or 'REJECTED'",
    }),
  })
  .strict();

export type ModerateJobStatusInput = z.infer<typeof moderateJobStatusSchema>;
