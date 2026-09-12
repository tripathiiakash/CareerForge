import React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Briefcase,
  Building2,
  PlusCircle,
  LayoutDashboard,
} from 'lucide-react';

export const RecruiterDashboardPage: React.FC = () => (
  <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Recruiter Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Monitor candidate pipelines, view new applicants, and manage job
          listings.
        </p>
      </div>
      <Badge variant="success">Recruiter Hub</Badge>
    </div>
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-emerald-400" />
          <span>Hiring Metrics Overview</span>
        </CardTitle>
        <CardDescription>
          Applicant tracking summaries and quick actions will appear here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="p-8 text-center text-muted-foreground border border-dashed border-border/60 rounded-lg">
          Connects to{' '}
          <code className="text-primary">
            GET /api/v1/jobs/recruiter/my-jobs
          </code>
        </div>
      </CardContent>
    </Card>
  </div>
);

export const RecruiterJobsPage: React.FC = () => (
  <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Job Openings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage active, draft, and closed positions.
        </p>
      </div>
      <Badge variant="success">Phase 5.4 Target</Badge>
    </div>
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-emerald-400" />
          <span>Posted Jobs List</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="p-8 text-center text-muted-foreground border border-dashed border-border/60 rounded-lg">
          Connects to{' '}
          <code className="text-primary">
            GET /api/v1/jobs/recruiter/my-jobs
          </code>
        </div>
      </CardContent>
    </Card>
  </div>
);

export const RecruiterPostJobPage: React.FC = () => (
  <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Post a New Role
        </h1>
        <p className="text-sm text-muted-foreground">
          Create and publish open job requisitions.
        </p>
      </div>
      <Badge variant="success">Job Creator</Badge>
    </div>
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlusCircle className="h-5 w-5 text-emerald-400" />
          <span>Job Details Form</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="p-8 text-center text-muted-foreground border border-dashed border-border/60 rounded-lg">
          Connects to <code className="text-primary">POST /api/v1/jobs</code>
        </div>
      </CardContent>
    </Card>
  </div>
);

export const RecruiterCompanyPage: React.FC = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Company Profile
      </h1>
      <p className="text-sm text-muted-foreground">
        Manage company branding, website, industry, and logo.
      </p>
    </div>
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-emerald-400" />
          <span>Organization Profile</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="p-8 text-center text-muted-foreground border border-dashed border-border/60 rounded-lg">
          Connects to{' '}
          <code className="text-primary">GET/PATCH /api/v1/company</code>
        </div>
      </CardContent>
    </Card>
  </div>
);
