import React, { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  Briefcase,
  Sparkles,
  Menu,
  X,
  ArrowRight,
  Github,
  Twitter,
  Linkedin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export const PublicLayout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const navLinks = [
    { name: 'Browse Jobs', path: '/jobs' },
    { name: 'For Students', path: '/student' },
    { name: 'For Recruiters', path: '/recruiter' },
    { name: 'AI Features', path: '/features' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/30 selection:text-primary-foreground relative overflow-x-hidden">
      {/* Subtle background ambient gradients */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-gradient-to-tr from-primary/15 via-purple-500/10 to-transparent blur-3xl opacity-70" />
        <div className="absolute top-1/3 -right-48 w-96 h-96 bg-primary/10 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute bottom-1/4 -left-48 w-96 h-96 bg-purple-500/10 blur-3xl rounded-full pointer-events-none" />
      </div>

      {/* Top Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl transition-all">
        <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-purple-600 text-white shadow-md shadow-primary/25 transition-transform group-hover:scale-105">
              <Briefcase className="h-5 w-5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
                CareerForge
              </span>
              <Badge
                variant="default"
                className="text-[10px] uppercase font-mono tracking-wider py-0 px-1.5 hidden sm:inline-flex"
              >
                Beta
              </Badge>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 bg-secondary/30 px-3 py-1.5 rounded-full border border-border/40 backdrop-blur-md">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.path}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                  isActive(link.path)
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                }`}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          {/* Action CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login">
              <Button
                variant="ghost"
                size="sm"
                className="font-medium text-foreground hover:bg-white/5"
              >
                Sign In
              </Button>
            </Link>
            <Link to="/register">
              <Button
                size="sm"
                className="font-semibold shadow-md shadow-primary/20"
              >
                Get Started
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-border/60 bg-background/95 backdrop-blur-2xl px-4 pt-3 pb-5 space-y-3">
            <div className="space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-2 rounded-lg text-base font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                >
                  {link.name}
                </Link>
              ))}
            </div>
            <div className="pt-3 border-t border-border/40 flex flex-col gap-2">
              <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="outline" className="w-full justify-center">
                  Sign In
                </Button>
              </Link>
              <Link to="/register" onClick={() => setMobileMenuOpen(false)}>
                <Button className="w-full justify-center">Get Started</Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Main Outlet */}
      <main className="flex-1 relative z-10">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 bg-background/90 backdrop-blur-xl">
        <div className="container mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:gap-12">
            <div className="space-y-4 md:col-span-1">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
                  <Briefcase className="h-4 w-4" />
                </div>
                <span className="text-lg font-bold">CareerForge</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Next-generation career platform bridging ambitious students with
                high-growth companies through AI-driven matching and direct
                hiring.
              </p>
              <div className="flex items-center gap-3 text-muted-foreground pt-1">
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  <Github className="h-4 w-4" />
                </a>
                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  <Twitter className="h-4 w-4" />
                </a>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  <Linkedin className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold tracking-wider text-foreground uppercase mb-3">
                For Students
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link
                    to="/jobs"
                    className="hover:text-foreground transition-colors"
                  >
                    Explore Jobs
                  </Link>
                </li>
                <li>
                  <Link
                    to="/student"
                    className="hover:text-foreground transition-colors"
                  >
                    Student Dashboard
                  </Link>
                </li>
                <li>
                  <span className="hover:text-foreground cursor-pointer transition-colors">
                    AI Resume Feedback
                  </span>
                </li>
                <li>
                  <span className="hover:text-foreground cursor-pointer transition-colors">
                    Application Tracker
                  </span>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold tracking-wider text-foreground uppercase mb-3">
                For Employers
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link
                    to="/recruiter"
                    className="hover:text-foreground transition-colors"
                  >
                    Recruiter Portal
                  </Link>
                </li>
                <li>
                  <span className="hover:text-foreground cursor-pointer transition-colors">
                    Post Job Openings
                  </span>
                </li>
                <li>
                  <span className="hover:text-foreground cursor-pointer transition-colors">
                    Manage Candidates
                  </span>
                </li>
                <li>
                  <span className="hover:text-foreground cursor-pointer transition-colors">
                    Employer Branding
                  </span>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold tracking-wider text-foreground uppercase mb-3">
                Platform
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link
                    to="/admin"
                    className="hover:text-foreground transition-colors"
                  >
                    Admin Console
                  </Link>
                </li>
                <li>
                  <span className="hover:text-foreground cursor-pointer transition-colors">
                    API & Integrations
                  </span>
                </li>
                <li>
                  <span className="hover:text-foreground cursor-pointer transition-colors">
                    Privacy Policy
                  </span>
                </li>
                <li>
                  <span className="hover:text-foreground cursor-pointer transition-colors">
                    Terms of Service
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-border/40 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>
              © {new Date().getFullYear()} CareerForge Inc. All rights reserved.
            </p>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Systems Operational &bull; Powered by Deep AI</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
