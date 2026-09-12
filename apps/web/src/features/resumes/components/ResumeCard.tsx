import React from 'react';
import {
  FileText,
  ExternalLink,
  Star,
  Sparkles,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StudentResumeItem } from '../types';
import { formatResumeDate, getResumeFileName } from '../resumesApi';

export interface ResumeCardProps {
  resume: StudentResumeItem;
}

export const ResumeCard: React.FC<ResumeCardProps> = ({ resume }) => {
  const fileName = getResumeFileName(resume.file_url);
  const formattedDate = formatResumeDate(resume.created_at);

  return (
    <Card
      glass
      className={`relative transition-all duration-200 ${
        resume.is_primary
          ? 'border-primary/50 shadow-md shadow-primary/10 bg-gradient-to-br from-primary/5 via-card/50 to-card'
          : 'border-border/60 hover:border-border/90'
      }`}
    >
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            {/* File Icon */}
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                resume.is_primary
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              <FileText className="h-5 w-5" />
            </div>

            {/* Resume Info */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-foreground tracking-tight text-base break-all">
                  {fileName}
                </h3>
                {resume.is_primary && (
                  <Badge
                    variant="success"
                    className="gap-1 py-0.5 px-2 text-xs font-semibold"
                  >
                    <Star className="h-3 w-3 fill-current" />
                    Primary Resume
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Uploaded {formattedDate}
                </span>

                {resume.has_analysis ? (
                  <span className="flex items-center gap-1 text-purple-400 font-medium">
                    <Sparkles className="h-3.5 w-3.5" />
                    AI Analysis Ready
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground/80">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    Parsed & Active
                  </span>
                )}
              </div>

              {resume.is_primary && (
                <p className="text-xs text-primary/90 font-medium">
                  Automatically attached when applying to jobs
                </p>
              )}
            </div>
          </div>

          {/* Action Link to view / download PDF */}
          <div className="flex items-center gap-2 self-end sm:self-center w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
            {resume.file_url && (
              <a
                href={resume.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground bg-secondary/80 hover:bg-secondary transition-colors"
                title="Open PDF resume in a new tab"
              >
                <ExternalLink className="h-3.5 w-3.5 text-primary" />
                <span>View PDF</span>
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
