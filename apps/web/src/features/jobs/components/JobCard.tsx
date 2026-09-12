import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Calendar,
  Briefcase,
  GraduationCap,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { JobListItem } from '../types';

export function formatPostedDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Recently posted';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Recently posted';
  }
}

interface JobCardProps {
  job: JobListItem;
  basePath?: string;
}

export const JobCard: React.FC<JobCardProps> = ({
  job,
  basePath = '/student/jobs',
}) => {
  const [imageError, setImageError] = useState(false);
  const formattedDate = formatPostedDate(job.created_at);
  const isInternship = job.employment_type === 'INTERNSHIP';
  const detailUrl = `${basePath}/${job.id}`;

  return (
    <Card
      glass
      className="group relative overflow-hidden transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5"
    >
      <CardContent className="p-5 sm:p-6 space-y-4">
        {/* Header: Company Avatar + Title & Company Info */}
        <div className="flex items-start gap-3.5 sm:gap-4">
          <div className="h-12 w-12 shrink-0 rounded-xl bg-secondary/80 border border-border/60 flex items-center justify-center overflow-hidden shadow-sm">
            {job.company.logo_url && !imageError ? (
              <img
                src={job.company.logo_url}
                alt={`${job.company.name} logo`}
                onError={() => setImageError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-sm font-bold text-primary tracking-wider uppercase">
                {job.company.name.slice(0, 2)}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground truncate max-w-[200px]">
                {job.company.name}
              </span>
              <span className="text-xs text-muted-foreground/40">•</span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>{formattedDate}</span>
              </span>
            </div>

            <Link
              to={detailUrl}
              className="group-hover:text-primary transition-colors focus:outline-none focus:underline"
              aria-label={`View details for ${job.title} at ${job.company.name}`}
            >
              <h3 className="text-base sm:text-lg font-semibold text-foreground tracking-tight line-clamp-1 mt-0.5">
                {job.title}
              </h3>
            </Link>
          </div>

          {/* Employment Type Badge */}
          <div className="shrink-0">
            {isInternship ? (
              <Badge
                variant="warning"
                className="gap-1 py-0.5 text-[11px] font-medium"
              >
                <GraduationCap className="h-3 w-3" />
                <span>Internship</span>
              </Badge>
            ) : (
              <Badge
                variant="info"
                className="gap-1 py-0.5 text-[11px] font-medium"
              >
                <Briefcase className="h-3 w-3" />
                <span>Full Time</span>
              </Badge>
            )}
          </div>
        </div>

        {/* Skills Tags */}
        <div className="pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {job.required_skills.slice(0, 4).map((skill) => (
              <Badge
                key={skill}
                variant="secondary"
                className="text-[11px] font-normal px-2.5 py-0.5 bg-secondary/50 hover:bg-secondary border border-border/40"
              >
                {skill}
              </Badge>
            ))}
            {job.required_skills.length > 4 && (
              <span className="text-[11px] text-muted-foreground font-medium pl-1">
                +{job.required_skills.length - 4} more
              </span>
            )}
          </div>
        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
          <span className="text-muted-foreground">
            Verified Employer Opportunity
          </span>

          <Link
            to={detailUrl}
            className="inline-flex items-center gap-1.5 font-medium text-primary hover:text-primary/80 transition-colors focus:outline-none focus:underline"
          >
            <span>View Job</span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};
