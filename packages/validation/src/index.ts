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
