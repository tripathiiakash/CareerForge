import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  LoginInput,
  loginSchema,
  RegisterInput,
  registerSchema,
} from '@careerforge/validation';
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
import { useAuth } from '@/auth/AuthContext';
import { extractApiError } from '@/lib/api';
import {
  getRoleDefaultPath,
  isSafeRedirectPath,
} from '@/components/auth/ProtectedRoute';
import {
  Briefcase,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [serverError, setServerError] = useState<{
    code: string;
    message: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    try {
      await login(data);

      // Resolve redirect destination safely
      const requestedDestination = location.state?.from;
      if (isSafeRedirectPath(requestedDestination)) {
        navigate(requestedDestination, { replace: true });
      } else {
        // Fallback to role-aware default portal
        // State will update with the authenticated user; read token/user or use fallback
        navigate('/student/jobs', { replace: true });
      }
    } catch (err: unknown) {
      const parsed = extractApiError(err);
      setServerError({
        code: parsed.code,
        message: parsed.message,
      });
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <Card glass className="w-full max-w-md shadow-2xl border-border/80">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-xl bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center text-white shadow-md shadow-primary/25">
            <Briefcase className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
          <CardDescription>
            Enter your credentials to access your CareerForge account
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardContent className="space-y-4">
            {/* Server Error Alert Banner */}
            {serverError && (
              <div
                className={`p-3.5 rounded-lg border text-sm flex items-start gap-2.5 animate-fade-in ${
                  serverError.code === 'FORBIDDEN'
                    ? 'border-destructive/60 bg-destructive/15 text-destructive-foreground'
                    : 'border-destructive/40 bg-destructive/10 text-destructive'
                }`}
                role="alert"
              >
                {serverError.code === 'FORBIDDEN' ? (
                  <ShieldAlert className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
                ) : (
                  <AlertCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
                )}
                <div>
                  <p className="font-semibold">{serverError.message}</p>
                  {serverError.code === 'FORBIDDEN' && (
                    <p className="text-xs mt-1 text-muted-foreground">
                      Please reach out to support@careerforge.local for appeal
                      inquiries.
                    </p>
                  )}
                </div>
              </div>
            )}

            <Input
              label="Email Address"
              type="email"
              placeholder="you@domain.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />
          </CardContent>

          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" isLoading={isSubmitting}>
              Sign In
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link
                to="/register"
                className="text-primary font-semibold hover:underline"
              >
                Create one now
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register: registerAuth } = useAuth();
  const [serverError, setServerError] = useState<{
    code: string;
    message: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      role: 'STUDENT',
    },
  });

  const selectedRole = watch('role');

  const onSubmit = async (data: RegisterInput) => {
    setServerError(null);
    try {
      await registerAuth(data);
      // Automatic login -> redirect to role home
      navigate(getRoleDefaultPath(data.role), { replace: true });
    } catch (err: unknown) {
      const parsed = extractApiError(err);
      setServerError({
        code: parsed.code,
        message:
          parsed.code === 'CONFLICT'
            ? 'This email address is already registered. Please sign in instead.'
            : parsed.message,
      });
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <Card glass className="w-full max-w-md shadow-2xl border-border/80">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-xl bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center text-white shadow-md shadow-primary/25">
            <Briefcase className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold">Join CareerForge</CardTitle>
          <CardDescription>
            Create your account and start your journey
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardContent className="space-y-4">
            {/* Server Error Alert Banner */}
            {serverError && (
              <div
                className="p-3.5 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm flex items-start gap-2.5 animate-fade-in"
                role="alert"
              >
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{serverError.message}</p>
                  {serverError.code === 'CONFLICT' && (
                    <Link
                      to="/login"
                      className="text-xs font-semibold text-primary underline block mt-1"
                    >
                      Proceed to Sign In &rarr;
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Role Selection Toggle */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground/90">
                I am joining as a
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-secondary/40 border border-border/60">
                <button
                  type="button"
                  onClick={() => setValue('role', 'STUDENT')}
                  className={`py-2 text-xs font-semibold rounded-md transition-all ${
                    selectedRole === 'STUDENT'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Student / Job Seeker
                </button>
                <button
                  type="button"
                  onClick={() => setValue('role', 'RECRUITER')}
                  className={`py-2 text-xs font-semibold rounded-md transition-all ${
                    selectedRole === 'RECRUITER'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Employer / Recruiter
                </button>
              </div>
              {errors.role && (
                <p className="text-xs text-destructive">
                  {errors.role.message}
                </p>
              )}
            </div>

            <Input
              label="Email Address"
              type="email"
              placeholder="you@domain.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Password"
              type="password"
              placeholder="Min. 8 chars with 1 number & 1 special"
              autoComplete="new-password"
              helperText="Must be 8-72 characters and contain at least 1 number and 1 special character"
              error={errors.password?.message}
              {...register('password')}
            />
          </CardContent>

          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" isLoading={isSubmitting}>
              Create Account
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Already have an account?{' '}
              <Link
                to="/login"
                className="text-primary font-semibold hover:underline"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
