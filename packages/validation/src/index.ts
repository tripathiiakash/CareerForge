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
