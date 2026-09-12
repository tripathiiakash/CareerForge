import React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Compass, Send, Sparkles, User, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const StudentJobsPage: React.FC = () => (
  <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Explore Tech Jobs
        </h1>
        <p className="text-sm text-muted-foreground">
          Discover verified software engineering, design, and product roles.
        </p>
      </div>
      <Badge variant="info">Phase 5.2 Target</Badge>
    </div>
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          <span>Active Opportunities</span>
        </CardTitle>
        <CardDescription>
          Search filters, pagination, and instant 1-click applications will
          connect here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="p-8 text-center text-muted-foreground border border-dashed border-border/60 rounded-lg">
          Connects to <code className="text-primary">GET /api/v1/jobs</code>
        </div>
      </CardContent>
    </Card>
  </div>
);

export const StudentApplicationsPage: React.FC = () => (
  <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          My Applications
        </h1>
        <p className="text-sm text-muted-foreground">
          Track real-time statuses and recruiter reviews for your submissions.
        </p>
      </div>
      <Badge variant="info">Phase 5.3 Target</Badge>
    </div>
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          <span>Application Tracker</span>
        </CardTitle>
        <CardDescription>
          Live timeline of SUBMITTED, UNDER_REVIEW, SHORTLISTED, and REJECTED
          states.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="p-8 text-center text-muted-foreground border border-dashed border-border/60 rounded-lg">
          Connects to{' '}
          <code className="text-primary">
            GET /api/v1/students/me/applications
          </code>
        </div>
      </CardContent>
    </Card>
  </div>
);

export const StudentResumePage: React.FC = () => (
  <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          AI Resume Optimization
        </h1>
        <p className="text-sm text-muted-foreground">
          Gemini 2.0 semantic evaluation, ATS scoring, and bullet point
          enhancements.
        </p>
      </div>
      <Badge variant="warning">AI Engine</Badge>
    </div>
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-400" />
          <span>Resume Analyzer</span>
        </CardTitle>
        <CardDescription>
          Upload your resume PDF to receive real-time ATS match insights.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="p-8 text-center text-muted-foreground border border-dashed border-border/60 rounded-lg">
          Connects to{' '}
          <code className="text-primary">POST /api/v1/resumes/upload</code> &{' '}
          <code className="text-primary">/analyze</code>
        </div>
      </CardContent>
    </Card>
  </div>
);

export const StudentProfilePage: React.FC = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Student Profile
      </h1>
      <p className="text-sm text-muted-foreground">
        Manage your bio, educational background, skills, and portfolio links.
      </p>
    </div>
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <span>Profile Overview</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="p-8 text-center text-muted-foreground border border-dashed border-border/60 rounded-lg">
          Connects to{' '}
          <code className="text-primary">GET /api/v1/students/me</code>
        </div>
      </CardContent>
    </Card>
  </div>
);
