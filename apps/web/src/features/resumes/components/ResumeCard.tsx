import React, { useState } from 'react';
import {
  FileText,
  ExternalLink,
  Star,
  Sparkles,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useResumeAnalysis } from '../hooks';
import { StudentResumeItem } from '../types';
import {
  formatResumeDate,
  getResumeFileName,
  openResumePdf,
} from '../resumesApi';
import { ResumeAnalysisView } from './ResumeAnalysisView';

export interface ResumeCardProps {
  resume: StudentResumeItem;
  defaultExpanded?: boolean;
}

export const ResumeCard: React.FC<ResumeCardProps> = ({
  resume,
  defaultExpanded,
}) => {
  const { toast } = useToast();
  const [isOpening, setIsOpening] = useState(false);
  const { data: analysisData } = useResumeAnalysis(
    resume.id,
    resume.has_analysis
  );
  const fileName = getResumeFileName(resume.file_url);
  const formattedDate = formatResumeDate(resume.created_at);

  // Expand by default if requested or if primary resume with existing analysis
  const [isAnalysisExpanded, setIsAnalysisExpanded] = useState<boolean>(
    defaultExpanded ?? Boolean(resume.is_primary && resume.has_analysis)
  );

  const handleOpenResume = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOpening) return;
    setIsOpening(true);
    try {
      await openResumePdf(resume.id, fileName);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to open resume document';
      toast({
        title: 'Unable to open resume',
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <Card
      glass
      className={`relative transition-all duration-200 ${
        resume.is_primary
          ? 'border-primary/50 shadow-md shadow-primary/10 bg-gradient-to-br from-primary/5 via-card/50 to-card'
          : 'border-border/60 hover:border-border/90'
      }`}
    >
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            {/* File Icon */}
            <button
              type="button"
              onClick={handleOpenResume}
              disabled={isOpening}
              title="Click to view resume"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all cursor-pointer hover:scale-105 active:scale-95 border-0 ${
                resume.is_primary
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {isOpening ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <FileText className="h-5 w-5" />
              )}
            </button>

            {/* Resume Info */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenResume}
                  disabled={isOpening}
                  className="font-semibold text-foreground tracking-tight text-base break-all text-left hover:text-primary hover:underline cursor-pointer transition-colors bg-transparent border-0 p-0"
                  title="Click to view resume"
                >
                  {fileName}
                </button>
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
                  analysisData?.status === 'FAILED' ? (
                    <button
                      type="button"
                      onClick={() => setIsAnalysisExpanded(!isAnalysisExpanded)}
                      className="flex items-center gap-1 text-rose-400 hover:text-rose-300 font-medium transition-colors cursor-pointer"
                      title="Click to view extraction/analysis error details"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                      <span>Analysis Failed</span>
                    </button>
                  ) : analysisData?.status === 'PROCESSING' ? (
                    <button
                      type="button"
                      onClick={() => setIsAnalysisExpanded(!isAnalysisExpanded)}
                      className="flex items-center gap-1 text-purple-400 hover:text-purple-300 font-medium transition-colors cursor-pointer"
                      title="Click to view analysis progress"
                    >
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
                      <span>Analyzing...</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsAnalysisExpanded(!isAnalysisExpanded)}
                      className="flex items-center gap-1 text-purple-400 hover:text-purple-300 font-medium transition-colors cursor-pointer"
                      title="Click to view AI Analysis"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>AI Analysis Ready</span>
                    </button>
                  )
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground/80">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    Uploaded & Active
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

          {/* Action Links & Buttons */}
          <div className="flex flex-wrap items-center gap-2 self-end sm:self-center w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenResume}
              disabled={isOpening}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 h-8 rounded-lg text-xs font-medium text-foreground bg-secondary/80 hover:bg-secondary transition-colors"
              title="Open PDF resume in a new tab"
            >
              {isOpening ? (
                <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5 text-primary" />
              )}
              <span>{isOpening ? 'Opening...' : 'View PDF'}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAnalysisExpanded(!isAnalysisExpanded)}
              className={`text-xs h-8 gap-1.5 transition-all ${
                isAnalysisExpanded
                  ? analysisData?.status === 'FAILED'
                    ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                    : 'bg-purple-500/10 border-purple-500/40 text-purple-300'
                  : analysisData?.status === 'FAILED'
                    ? 'hover:border-rose-500/40 hover:text-rose-300'
                    : 'hover:border-purple-500/40 hover:text-purple-300'
              }`}
            >
              {analysisData?.status === 'FAILED' ? (
                <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              )}
              <span>
                {analysisData?.status === 'FAILED'
                  ? 'View Error'
                  : resume.has_analysis
                    ? 'AI Analysis'
                    : 'Analyze with AI'}
              </span>
              {isAnalysisExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* Expandable AI Analysis Panel */}
        {isAnalysisExpanded && (
          <div className="pt-2 border-t border-border/50">
            <ResumeAnalysisView
              resumeId={resume.id}
              hasAnalysis={resume.has_analysis}
              isPrimary={resume.is_primary}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
