import React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

export { AdminModerationPage } from '@/features/adminModeration';

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
