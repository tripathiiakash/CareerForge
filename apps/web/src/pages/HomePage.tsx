import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Search,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  Building,
  GraduationCap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (location.pathname === '/features' || location.hash === '#features') {
      const el = document.getElementById('features');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [location]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchTerm.trim();
    if (trimmed) {
      navigate(`/jobs?search=${encodeURIComponent(trimmed)}`);
    } else {
      navigate('/jobs');
    }
  };

  const trendingTags = [
    'React',
    'TypeScript',
    'Node.js',
    'Python',
    'Full Stack',
    'PostgreSQL',
  ];

  return (
    <div className="space-y-16 md:space-y-24 pb-12 md:pb-20">
      {/* Hero Section */}
      <section className="relative pt-10 md:pt-16 lg:pt-24 text-center">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6">
          {/* AI Innovation Pill */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 backdrop-blur-md mb-8 animate-fade-in">
            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
            <span className="text-xs font-semibold text-primary-foreground tracking-wide">
              Powered by Google Gemini AI Analysis
            </span>
          </div>

          {/* Main Title */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-[1.1] mb-6">
            Forge Your Tech Career with{' '}
            <span className="bg-gradient-to-r from-primary via-purple-400 to-indigo-300 bg-clip-text text-transparent">
              Precision & Insight
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg md:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed mb-10">
            Connect directly with verified tech employers, receive actionable ATS
            resume feedback powered by Google Gemini, and track your applications
            with complete end-to-end transparency.
          </p>

          {/* Search Bar Container */}
          <form
            onSubmit={handleSearch}
            className="max-w-2xl mx-auto p-2 sm:p-2.5 rounded-2xl glass-card border border-border/80 shadow-2xl flex flex-col sm:flex-row gap-2.5 items-center"
          >
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by job title, skill, or keyword (e.g. React, Node.js)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-transparent border-0 text-sm text-foreground placeholder:text-slate-400 focus:outline-none"
                aria-label="Search jobs"
              />
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full sm:w-auto px-7 font-semibold gap-2 shadow-lg shadow-primary/25 shrink-0"
            >
              <span>Find Jobs</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          {/* Trending Searches */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
            <span className="font-medium text-slate-300">Trending skills:</span>
            {trendingTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  setSearchTerm(tag);
                  navigate(`/jobs?search=${encodeURIComponent(tag)}`);
                }}
                className="px-2.5 py-1 rounded-md bg-secondary/50 border border-border/40 hover:bg-secondary hover:text-foreground transition-all"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Architecture Highlights (Replaces Fabricated Stats) */}
      <section className="container mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6 sm:p-8 rounded-2xl glass-card border border-border/60">
          <div className="text-center sm:text-left space-y-1.5 p-2">
            <div className="text-xs font-mono uppercase tracking-wider text-primary font-semibold">
              Architecture
            </div>
            <div className="text-base sm:text-lg font-bold text-foreground">
              Admin-Moderated Roles
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Postings are moderated prior to publication to maintain listing quality and eliminate spam.
            </p>
          </div>
          <div className="text-center sm:text-left space-y-1.5 p-2">
            <div className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold">
              Intelligence
            </div>
            <div className="text-base sm:text-lg font-bold text-foreground">
              Gemini AI Resume Scoring
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Evaluates ATS readability, missing skill gaps, and bullet formatting tips for PDF resumes.
            </p>
          </div>
          <div className="text-center sm:text-left space-y-1.5 p-2">
            <div className="text-xs font-mono uppercase tracking-wider text-purple-400 font-semibold">
              Recruiting
            </div>
            <div className="text-base sm:text-lg font-bold text-foreground">
              Direct Applications
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Connect with recruiters through job applications submitted directly to verified employers.
            </p>
          </div>
          <div className="text-center sm:text-left space-y-1.5 p-2">
            <div className="text-xs font-mono uppercase tracking-wider text-sky-400 font-semibold">
              Transparency
            </div>
            <div className="text-base sm:text-lg font-bold text-foreground">
              Clear Status Tracking
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Track application progression across Applied, Shortlisted, and Rejected stages.
            </p>
          </div>
        </div>
      </section>

      {/* Core Features Grid */}
      <section id="features" className="container mx-auto max-w-7xl px-4 sm:px-6 scroll-mt-24">
        <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
          <Badge
            variant="default"
            className="text-xs font-mono uppercase tracking-wider"
          >
            Platform Features
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Everything You Need to Advance Your Career
          </h2>
          <p className="text-slate-300 leading-relaxed">
            Built for technical talent: objective ATS intelligence, direct recruiter visibility, and verified job postings.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card
            glass
            className="relative overflow-hidden group hover:border-primary/50 transition-all flex flex-col justify-between"
          >
            <CardHeader className="space-y-3">
              <div className="h-12 w-12 rounded-xl bg-primary/20 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                <Sparkles className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl">AI Resume Analysis</CardTitle>
              <CardDescription className="text-slate-300 text-sm leading-relaxed">
                Upload your PDF resume to receive structured ATS readability
                scoring, identify missing technical skills, and review formatting
                recommendations powered by Google Gemini.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  Google Gemini-powered semantic resume parsing
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  AI-generated ATS readability score (0–100) & missing skills
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  Actionable suggestions for high-impact bullet points
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card
            glass
            className="relative overflow-hidden group hover:border-purple-500/50 transition-all flex flex-col justify-between"
          >
            <CardHeader className="space-y-3">
              <div className="h-12 w-12 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <TrendingUp className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl">Transparent Tracking</CardTitle>
              <CardDescription className="text-slate-300 text-sm leading-relaxed">
                Monitor every stage of your candidacy directly in your student
                dashboard as recruiters review and advance applications.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  Clear status stages: Applied, Shortlisted, and Rejected
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  Dedicated student portal tracking all submissions
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  Track your application status and stay informed as recruiters update your application
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card
            glass
            className="relative overflow-hidden group hover:border-sky-500/50 transition-all flex flex-col justify-between"
          >
            <CardHeader className="space-y-3">
              <div className="h-12 w-12 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl">Verified Employers</CardTitle>
              <CardDescription className="text-slate-300 text-sm leading-relaxed">
                Admin approval helps review job postings before they become visible to students.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  Admin moderation before postings become active
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  Verified recruiter and company organization profiles
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  Direct candidate applications linked to primary resumes
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Dual Audience CTA Section */}
      <section className="container mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* For Candidates */}
          <div className="rounded-2xl p-8 bg-gradient-to-br from-secondary/50 via-card to-background border border-border/70 shadow-lg space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="h-12 w-12 rounded-xl bg-primary/20 text-primary flex items-center justify-center">
                <GraduationCap className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-bold text-foreground">
                For Students & Job Seekers
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Build your profile, analyze your PDF resume with Google Gemini
                before applying, and apply directly to open technical positions.
              </p>
            </div>
            <Link to="/student">
              <Button
                size="lg"
                className="w-full sm:w-auto font-semibold gap-2"
              >
                Enter Student Hub
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {/* For Recruiters */}
          <div className="rounded-2xl p-8 bg-gradient-to-br from-secondary/50 via-card to-background border border-border/70 shadow-lg space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Building className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-bold text-foreground">
                For Tech Employers
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Post technical positions, review submitted candidate resumes,
                and manage applicant statuses through your recruiter portal.
              </p>
            </div>
            <Link to="/recruiter">
              <Button
                size="lg"
                variant="secondary"
                className="w-full sm:w-auto font-semibold gap-2"
              >
                Recruiter Portal
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
