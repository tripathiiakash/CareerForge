import React from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  Building2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Trash2,
  Users,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RecruiterJobItem } from '../types';

interface RecruiterJobCardProps {
  job: RecruiterJobItem;
  onDeleteClick: (job: RecruiterJobItem) => void;
}

export function formatJobDate(dateStr: string): string {
  if (!dateStr) return 'Recently';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Recently';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d);
  } catch {
    return 'Recently';
  }
}

export const RecruiterJobCard: React.FC<RecruiterJobCardProps> = ({
  job,
  onDeleteClick,
}) => {
  const getStatusBadge = () => {
    switch (job.status) {
      case 'ACTIVE':
        return (
          <Badge variant="success" className="gap-1 items-center text-xs">
            <CheckCircle2 className="h-3 w-3" />
            <span>Active</span>
          </Badge>
        );
      case 'REJECTED':
        return (
          <Badge variant="destructive" className="gap-1 items-center text-xs">
            <AlertCircle className="h-3 w-3" />
            <span>Rejected</span>
          </Badge>
        );
      case 'PENDING':
      default:
        return (
          <Badge variant="warning" className="gap-1 items-center text-xs">
            <Clock className="h-3 w-3" />
            <span>Pending Approval</span>
          </Badge>
        );
    }
  };

  const getEmploymentTypeBadge = () => {
    return (
      <Badge variant="secondary" className="text-xs font-medium">
        {job.employment_type === 'FULL_TIME' ? 'Full-Time' : 'Internship'}
      </Badge>
    );
  };

  return (
    <Card
      glass
      className="border-border/70 hover:border-emerald-500/40 transition-all shadow-sm"
    >
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {getStatusBadge()}
              {getEmploymentTypeBadge()}
            </div>
            <CardTitle className="text-xl font-bold tracking-tight text-foreground truncate">
              {job.title}
            </CardTitle>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1 font-medium text-foreground">
                <Building2 className="h-3.5 w-3.5 text-emerald-400" />
                {job.company?.name || 'Your Company'}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Posted {formatJobDate(job.created_at)}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
            <Link to={`/recruiter/jobs/${job.id}/applicants`}>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 border-emerald-500/40 hover:border-emerald-500/80 hover:bg-emerald-500/10"
                aria-label={`View applicants for ${job.title}`}
              >
                <Users className="h-3.5 w-3.5" />
                <span>View Applicants</span>
              </Button>
            </Link>

            <Link to={`/recruiter/jobs/${job.id}/edit`}>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs hover:border-emerald-500/60"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit</span>
              </Button>
            </Link>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onDeleteClick(job)}
              className="gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/60"
              aria-label={`Delete ${job.title}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-1">
        {/* Description snippet */}
        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
          {job.description}
        </p>

        {/* Required Skills */}
        {job.required_skills && job.required_skills.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Required Skills
            </span>
            <div className="flex flex-wrap gap-1.5">
              {job.required_skills.map((skill, idx) => (
                <Badge
                  key={idx}
                  variant="secondary"
                  className="text-xs px-2.5 py-0.5 capitalize font-normal bg-secondary/50"
                >
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
