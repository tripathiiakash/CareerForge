import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useStudentProfile } from './hooks';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Compass,
  Send,
  Sparkles,
  User,
  ArrowRight,
  GraduationCap,
  Building,
  Calendar,
  Github,
  Linkedin,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

/**
 * Calculates genuine profile completeness based on filled fields.
 */
export function calculateProfileCompleteness(
  profile:
    | {
        first_name?: string | null;
        last_name?: string | null;
        university?: string | null;
        degree?: string | null;
        graduation_year?: number | null;
        skills?: string[] | null;
        github_url?: string | null;
        linkedin_url?: string | null;
      }
    | null
    | undefined
): number {
  if (!profile) return 0;
  const fields = [
    Boolean(profile.first_name && profile.first_name.trim().length > 0),
    Boolean(profile.last_name && profile.last_name.trim().length > 0),
    Boolean(profile.university && profile.university.trim().length > 0),
    Boolean(profile.degree && profile.degree.trim().length > 0),
    Boolean(profile.graduation_year && profile.graduation_year >= 2000),
    Boolean(profile.skills && profile.skills.length > 0),
    Boolean(profile.github_url && profile.github_url.trim().length > 0),
    Boolean(profile.linkedin_url && profile.linkedin_url.trim().length > 0),
  ];

  const completed = fields.filter(Boolean).length;
  return Math.round((completed / fields.length) * 100);
}

export const StudentDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { data: profile, isLoading, isError, refetch } = useStudentProfile();

  const completeness = calculateProfileCompleteness(profile);
  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  const displayName = fullName || user?.email || 'Student';

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground font-medium">
          Loading student dashboard...
        </span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive space-y-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <h2 className="font-semibold text-lg">Failed to load profile data</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          We encountered an issue retrieving your student profile. Please try
          again.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 animate-fade-in">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 sm:p-8 rounded-2xl glass-card border border-border/70 relative overflow-hidden">
        <div className="space-y-2 z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Welcome back</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Hello, {displayName}
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Track your career opportunities, optimize your resume with AI, and
            keep your verified profile updated for employers.
          </p>
        </div>

        {/* Profile Completeness Pill Card */}
        <div className="z-10 shrink-0 w-full md:w-64 p-4 rounded-xl bg-secondary/40 border border-border/60 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-foreground">Profile Completeness</span>
            <span
              className={
                completeness === 100
                  ? 'text-emerald-400 font-bold'
                  : 'text-primary font-bold'
              }
            >
              {completeness}%
            </span>
          </div>

          <div className="w-full bg-background/60 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                completeness === 100 ? 'bg-emerald-500' : 'bg-primary'
              }`}
              style={{ width: `${completeness}%` }}
            />
          </div>

          {completeness < 100 ? (
            <Link
              to="/student/profile"
              className="text-xs text-primary hover:underline flex items-center justify-between pt-1 font-medium"
            >
              <span>Complete your profile</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : (
            <div className="flex items-center gap-1 text-[11px] text-emerald-400 pt-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Profile 100% complete</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation CTA Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Link to="/student/jobs" className="group">
          <Card
            glass
            className="h-full group-hover:border-primary/50 group-hover:scale-[1.01] transition-all"
          >
            <CardHeader className="space-y-3 pb-3">
              <div className="h-10 w-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                <Compass className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg">Job Board</CardTitle>
              <CardDescription className="text-xs">
                Explore curated software and technology positions from verified
                employers.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-primary group-hover:translate-x-1 transition-transform">
                <span>Browse listings</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/student/applications" className="group">
          <Card
            glass
            className="h-full group-hover:border-sky-500/50 group-hover:scale-[1.01] transition-all"
          >
            <CardHeader className="space-y-3 pb-3">
              <div className="h-10 w-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Send className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg">My Applications</CardTitle>
              <CardDescription className="text-xs">
                Track statuses, interview schedules, and recruiter notes in
                real-time.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-sky-400 group-hover:translate-x-1 transition-transform">
                <span>View tracker</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/student/resume" className="group">
          <Card
            glass
            className="h-full group-hover:border-purple-500/50 group-hover:scale-[1.01] transition-all"
          >
            <CardHeader className="space-y-3 pb-3">
              <div className="h-10 w-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Sparkles className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg">AI Resume Review</CardTitle>
              <CardDescription className="text-xs">
                Run Gemini semantic evaluations, ATS keyword checks, and
                improvements.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-purple-400 group-hover:translate-x-1 transition-transform">
                <span>Analyze resume</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/student/profile" className="group">
          <Card
            glass
            className="h-full group-hover:border-emerald-500/50 group-hover:scale-[1.01] transition-all"
          >
            <CardHeader className="space-y-3 pb-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <User className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg">Student Profile</CardTitle>
              <CardDescription className="text-xs">
                Manage your education, skills, portfolio links, and biographical
                details.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 group-hover:translate-x-1 transition-transform">
                <span>Manage profile</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Active Profile Summary Card */}
      <Card glass className="border-border/70">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-xl">Profile Snapshot</CardTitle>
            <CardDescription>
              Verified information shared with tech recruiters.
            </CardDescription>
          </div>
          <Link to="/student/profile">
            <Button variant="outline" size="sm">
              Edit Details
            </Button>
          </Link>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Education Info */}
            <div className="p-4 rounded-xl bg-secondary/30 border border-border/40 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <GraduationCap className="h-4 w-4 text-primary" />
                <span>Education</span>
              </div>
              <p className="text-sm font-medium text-foreground">
                {profile?.university || (
                  <span className="text-muted-foreground italic">
                    No university added
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {profile?.degree || 'No degree listed'}
              </p>
              {profile?.graduation_year && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Class of {profile.graduation_year}</span>
                </div>
              )}
            </div>

            {/* Links */}
            <div className="p-4 rounded-xl bg-secondary/30 border border-border/40 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Building className="h-4 w-4 text-primary" />
                <span>Social & Portfolio</span>
              </div>
              <div className="space-y-2 pt-1">
                {profile?.github_url ? (
                  <a
                    href={profile.github_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-xs text-foreground hover:text-primary transition-colors truncate"
                  >
                    <Github className="h-4 w-4 shrink-0" />
                    <span className="truncate">{profile.github_url}</span>
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground italic block">
                    No GitHub link provided
                  </span>
                )}

                {profile?.linkedin_url ? (
                  <a
                    href={profile.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-xs text-foreground hover:text-primary transition-colors truncate"
                  >
                    <Linkedin className="h-4 w-4 shrink-0 text-sky-400" />
                    <span className="truncate">{profile.linkedin_url}</span>
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground italic block">
                    No LinkedIn link provided
                  </span>
                )}
              </div>
            </div>

            {/* Registered Account */}
            <div className="p-4 rounded-xl bg-secondary/30 border border-border/40 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <User className="h-4 w-4 text-primary" />
                <span>Account Identity</span>
              </div>
              <p className="text-sm font-medium text-foreground truncate">
                {user?.email}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Badge variant="info">Verified Student</Badge>
              </div>
            </div>
          </div>

          {/* Skills Section */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Technical Skills ({profile?.skills?.length || 0})
            </h4>
            {profile?.skills && profile.skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill) => (
                  <Badge
                    key={skill}
                    variant="secondary"
                    className="capitalize text-xs font-normal"
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No skills added yet. Add skills in your profile to improve
                matching with employer job posts.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
