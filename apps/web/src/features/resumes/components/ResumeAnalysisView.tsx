import React, { useState } from 'react';
import {
  Sparkles,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Target,
  Lightbulb,
  Clock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { extractApiError } from '@/lib/api';
import { useResumeAnalysis, useTriggerResumeAnalysis } from '../hooks';
import { formatResumeDate } from '../resumesApi';

export interface ResumeAnalysisViewProps {
  resumeId: string;
  hasAnalysis: boolean;
  isPrimary?: boolean;
}

/**
 * Sanitizes raw analysis error messages to ensure internal provider names,
 * HTTP status codes, and infrastructure details never leak to the student.
 */
export function sanitizeAnalysisErrorMessage(
  rawMessage?: string | null
): string {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return 'The AI analysis service was unable to process this resume. Please try again.';
  }

  const lower = rawMessage.toLowerCase();

  // Guard against provider names, HTTP status codes, database, or internal error leaks
  const containsInfrastructureDetails =
    lower.includes('gemini') ||
    lower.includes('openai') ||
    lower.includes('claude') ||
    lower.includes('anthropic') ||
    lower.includes('api') ||
    lower.includes('status 5') ||
    lower.includes('status 4') ||
    lower.includes('http') ||
    lower.includes('exception') ||
    lower.includes('prisma') ||
    lower.includes('postgres') ||
    lower.includes('bullmq') ||
    lower.includes('redis') ||
    lower.includes('stack') ||
    lower.includes('internal');

  if (containsInfrastructureDetails) {
    return 'The AI analysis service was unable to process this resume. Please try again.';
  }

  return rawMessage;
}

export const ResumeAnalysisView: React.FC<ResumeAnalysisViewProps> = ({
  resumeId,
  hasAnalysis,
}) => {
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: analysisData,
    isLoading,
    isError,
    error,
    refetch,
  } = useResumeAnalysis(resumeId, true);

  const triggerMutation = useTriggerResumeAnalysis();

  const handleTriggerAnalysis = () => {
    setActionError(null);
    triggerMutation.mutate(
      { resumeId },
      {
        onError: (err) => {
          const apiErr = extractApiError(err);
          setActionError(apiErr.message);
        },
      }
    );
  };

  // Helper for ATS score color classification
  const getScoreBadge = (score: number) => {
    if (score >= 80) {
      return {
        variant: 'success' as const,
        label: 'Strong ATS Match',
        bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        text: 'text-emerald-400',
      };
    }
    if (score >= 60) {
      return {
        variant: 'warning' as const,
        label: 'Moderate ATS Match',
        bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        text: 'text-amber-400',
      };
    }
    return {
      variant: 'destructive' as const,
      label: 'Needs Improvement',
      bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      text: 'text-rose-400',
    };
  };

  // State E: Loading Skeleton
  if (isLoading && hasAnalysis) {
    return (
      <div className="rounded-xl border border-border/50 bg-secondary/10 p-5 animate-pulse space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 bg-secondary rounded-full" />
          <div className="h-4 w-40 bg-secondary rounded" />
        </div>
        <div className="h-16 w-full bg-secondary/50 rounded" />
      </div>
    );
  }

  // State: Query Error
  if (isError && !analysisData) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive space-y-2">
        <div className="flex items-center gap-2 font-medium">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load AI analysis details</span>
        </div>
        <p className="text-muted-foreground">
          {extractApiError(error).message}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="h-7 text-xs gap-1"
        >
          <RefreshCw className="h-3 w-3" />
          <span>Retry</span>
        </Button>
      </div>
    );
  }

  // State A: Not Triggered yet (404 or null)
  if (!analysisData || (!hasAnalysis && analysisData.status === undefined)) {
    return (
      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <h4 className="text-sm font-semibold text-foreground">
                AI Resume Optimization
              </h4>
              <Badge
                variant="outline"
                className="text-[10px] text-purple-300 py-0 px-1.5 border-purple-500/30"
              >
                AI Analysis
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Evaluate your resume for industry keywords, missing technical
              skills, and formatting best practices.
            </p>
          </div>

          <Button
            size="sm"
            onClick={handleTriggerAnalysis}
            disabled={triggerMutation.isPending}
            className="shrink-0 gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-xs shadow-sm"
          >
            {triggerMutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Starting...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>Analyze Resume</span>
              </>
            )}
          </Button>
        </div>

        {actionError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{actionError}</span>
          </div>
        )}
      </div>
    );
  }

  // State B: Processing
  if (analysisData.status === 'PROCESSING') {
    return (
      <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">
                AI Analysis in Progress
              </h4>
              <Badge
                variant="outline"
                className="text-[10px] text-purple-300 py-0 px-1.5 border-purple-500/30 animate-pulse"
              >
                Evaluating
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              AI is analyzing your resume for keywords, skill coverage, and
              actionable improvements.
            </p>
          </div>
        </div>

        {/* Pulsing visual indicator */}
        <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
          <div className="bg-purple-500 h-full w-2/3 animate-pulse rounded-full" />
        </div>
      </div>
    );
  }

  // State D: Failed
  if (analysisData.status === 'FAILED') {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-foreground">
                Resume Analysis Failed
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {sanitizeAnalysisErrorMessage(analysisData.error_message)}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleTriggerAnalysis}
            disabled={triggerMutation.isPending}
            className="shrink-0 gap-1.5 text-xs h-8"
          >
            {triggerMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            <span>Retry Analysis</span>
          </Button>
        </div>

        {actionError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {actionError}
          </div>
        )}
      </div>
    );
  }

  // State C: Completed
  if (analysisData.status === 'COMPLETED' && analysisData.analysis) {
    const { score, missing_skills, formatting_tips, created_at } =
      analysisData.analysis;
    const scoreBadge = getScoreBadge(score);
    const formattedDate = formatResumeDate(created_at);

    return (
      <div className="rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 via-card/50 to-card p-5 space-y-5">
        {/* Header: Score & Meta */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-border/50">
          <div className="flex items-center gap-3">
            {/* Score Ring / Display */}
            <div
              className={`flex flex-col items-center justify-center h-14 w-14 rounded-xl border ${scoreBadge.bg} shrink-0 shadow-sm`}
            >
              <span className="text-xl font-bold tracking-tight">{score}</span>
              <span className="text-[9px] uppercase tracking-wider font-semibold opacity-80">
                / 100
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-foreground tracking-tight">
                  ATS Resume Match Score
                </h4>
                <Badge
                  variant={scoreBadge.variant}
                  className="text-xs py-0.5 px-2"
                >
                  {scoreBadge.label}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <Clock className="h-3 w-3" />
                <span>Evaluated {formattedDate}</span>
              </div>
            </div>
          </div>

          {/* Re-analyze Action Button */}
          <div className="self-end sm:self-center">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTriggerAnalysis}
              disabled={triggerMutation.isPending}
              className="text-xs h-8 gap-1.5 border-purple-500/30 hover:bg-purple-500/10 text-foreground"
              title="Re-run AI analysis (subject to 5-minute cooldown)"
            >
              {triggerMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 text-purple-400" />
              )}
              <span>Re-analyze</span>
            </Button>
          </div>
        </div>

        {/* Action Error if re-trigger is rate-limited */}
        {actionError && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Grid: Missing Skills & Formatting Tips */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Missing Skills Section */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Target className="h-4 w-4 text-purple-400" />
              <span>Identified Skill Gaps ({missing_skills.length})</span>
            </div>

            {missing_skills && missing_skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {missing_skills.map((skill, idx) => (
                  <Badge
                    key={idx}
                    variant="outline"
                    className="text-xs py-1 px-2.5 font-medium border-border/80 bg-secondary/40 text-foreground"
                  >
                    + {skill}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>No major skill gaps identified. Excellent coverage!</span>
              </div>
            )}
          </div>

          {/* Formatting & Content Tips */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Lightbulb className="h-4 w-4 text-amber-400" />
              <span>
                Formatting & Impact Suggestions ({formatting_tips.length})
              </span>
            </div>

            {formatting_tips && formatting_tips.length > 0 ? (
              <ul className="space-y-2 text-xs text-muted-foreground">
                {formatting_tips.map((tip, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 leading-relaxed"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-purple-500/10 text-purple-400 text-[10px] font-bold mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="text-foreground/90">{tip}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  Resume format aligns with ATS scanning best practices.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};
