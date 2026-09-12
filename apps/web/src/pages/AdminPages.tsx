import React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckSquare, BarChart3, AlertCircle } from 'lucide-react';

export const AdminModerationPage: React.FC = () => (
  <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Job Moderation Queue
        </h1>
        <p className="text-sm text-muted-foreground">
          Review submitted job postings and approve or reject with moderation
          notes.
        </p>
      </div>
      <Badge variant="warning">Admin Clearance</Badge>
    </div>
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckSquare className="h-5 w-5 text-amber-400" />
          <span>Pending Approvals</span>
        </CardTitle>
        <CardDescription>
          Jobs awaiting compliance review and administrative verification.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="p-8 text-center text-muted-foreground border border-dashed border-border/60 rounded-lg">
          Connects to{' '}
          <code className="text-primary">GET /api/v1/jobs/admin/pending</code> &{' '}
          <code className="text-primary">PATCH /api/v1/jobs/:id/moderate</code>
        </div>
      </CardContent>
    </Card>
  </div>
);

export const AdminAnalyticsPage: React.FC = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        System Analytics
      </h1>
      <p className="text-sm text-muted-foreground">
        High-level metrics across users, postings, and application volumes.
      </p>
    </div>
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-amber-400" />
          <span>Platform Overview</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="p-8 text-center text-muted-foreground border border-dashed border-border/60 rounded-lg">
          Connects to Admin Audit & Metrics endpoints
        </div>
      </CardContent>
    </Card>
  </div>
);
