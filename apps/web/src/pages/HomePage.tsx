import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  MapPin,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  CheckCircle2,
  TrendingUp,
  Building,
  GraduationCap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [location, setLocation] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchTerm) params.set('q', searchTerm);
    if (location) params.set('location', location);
    navigate(`/jobs?${params.toString()}`);
  };

  const trendingTags = [
    'React',
    'TypeScript',
    'Node.js',
    'Python',
    'Remote',
    'Frontend',
    'Backend',
  ];

  return (
    <div className="space-y-24 pb-20">
      {/* Hero Section */}
      <section className="relative pt-12 md:pt-20 lg:pt-28 text-center">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6">
          {/* AI Innovation Pill */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 backdrop-blur-md mb-8 animate-fade-in">
            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
            <span className="text-xs font-semibold text-primary-foreground tracking-wide">
              Powered by Google Gemini 2.0 AI Resume Scoring
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
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
            Connect directly with verified tech employers, unlock instantaneous
            AI resume analysis, and monitor your applications with complete
            end-to-end transparency.
          </p>

          {/* Search Bar Container */}
          <form
            onSubmit={handleSearch}
            className="max-w-3xl mx-auto p-2 sm:p-3 rounded-2xl glass-card border border-border/80 shadow-2xl flex flex-col sm:flex-row gap-2.5 items-center"
          >
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Job title, skill, or keyword..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-transparent border-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>

            <div className="hidden sm:block h-7 w-[1px] bg-border/60" />

            <div className="relative flex-1 w-full">
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="City, state, or 'Remote'..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-transparent border-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full sm:w-auto px-7 font-semibold gap-2 shadow-lg shadow-primary/25"
            >
              <span>Find Jobs</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          {/* Trending Searches */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">Trending:</span>
            {trendingTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  setSearchTerm(tag);
                  navigate(`/jobs?q=${encodeURIComponent(tag)}`);
                }}
                className="px-2.5 py-1 rounded-md bg-secondary/50 border border-border/40 hover:bg-secondary hover:text-foreground transition-all"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Counter Section */}
      <section className="container mx-auto max-w-6xl px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 sm:p-8 rounded-2xl glass-card border border-border/60">
          <div className="text-center space-y-1">
            <div className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
              10,000+
            </div>
            <div className="text-xs sm:text-sm text-muted-foreground">
              Active Tech Positions
            </div>
          </div>
          <div className="text-center space-y-1">
            <div className="text-3xl sm:text-4xl font-extrabold text-emerald-400 tracking-tight">
              500+
            </div>
            <div className="text-xs sm:text-sm text-muted-foreground">
              Verified Companies
            </div>
          </div>
          <div className="text-center space-y-1">
            <div className="text-3xl sm:text-4xl font-extrabold text-purple-400 tracking-tight">
              94%
            </div>
            <div className="text-xs sm:text-sm text-muted-foreground">
              Candidate Satisfaction
            </div>
          </div>
          <div className="text-center space-y-1">
            <div className="text-3xl sm:text-4xl font-extrabold text-sky-400 tracking-tight">
              &lt; 24h
            </div>
            <div className="text-xs sm:text-sm text-muted-foreground">
              Avg. Recruiter Response
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Grid */}
      <section className="container mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
          <Badge
            variant="default"
            className="text-xs font-mono uppercase tracking-wider"
          >
            Engineered For Excellence
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Everything You Need to Land Your Next Role
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Eliminate black-box applications with full transparency, deep ATS
            intelligence, and verified direct recruiting.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card
            glass
            className="relative overflow-hidden group hover:border-primary/50 transition-all"
          >
            <CardHeader className="space-y-3">
              <div className="h-12 w-12 rounded-xl bg-primary/20 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                <Sparkles className="h-6 w-6" />
              </div>
              <CardTitle>AI Resume Optimization</CardTitle>
              <CardDescription>
                Upload your PDF or DOCX resume to get instant actionable
                feedback, ATS keyword scoring, and bullet point enhancements
                tailored to real jobs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Gemini-powered semantic analysis
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Real-time match scoring against job requirements
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Actionable suggestions for high impact
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card
            glass
            className="relative overflow-hidden group hover:border-purple-500/50 transition-all"
          >
            <CardHeader className="space-y-3">
              <div className="h-12 w-12 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <TrendingUp className="h-6 w-6" />
              </div>
              <CardTitle>Transparent Tracking</CardTitle>
              <CardDescription>
                Never wonder where your application went. Get real-time status
                updates from SUBMITTED to REVIEWING, SHORTLISTED, or INTERVIEW.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Instant notification on recruiter views
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Structured recruitment stages
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Detailed feedback notes when available
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card
            glass
            className="relative overflow-hidden group hover:border-sky-500/50 transition-all"
          >
            <CardHeader className="space-y-3">
              <div className="h-12 w-12 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <CardTitle>Verified Tech Employers</CardTitle>
              <CardDescription>
                All company listings undergo rigorous administrative moderation
                to guarantee authentic jobs, accurate compensation, and
                legitimate opportunities.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Strict admin review before publication
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Authentic verified company profiles
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Zero recruitment spam or ghost jobs
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
              <p className="text-sm text-muted-foreground leading-relaxed">
                Build your professional portfolio, test your resume with AI
                before applying, and apply to top roles with a single click.
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
              <p className="text-sm text-muted-foreground leading-relaxed">
                Post high-impact technical roles, review pre-vetted candidate
                applications, and streamline your recruitment pipeline with
                ease.
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
