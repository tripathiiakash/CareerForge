/**
 * Domain & API types for Admin Platform Analytics & Metrics.
 * Adheres strictly to docs/API.md §9.5 and backend DTOs.
 */

export interface PlatformMetricsData {
  total_students: number;
  total_recruiters: number;
  active_jobs: number;
  pending_jobs: number;
  total_applications: number;
}

export type AdminMetrics = PlatformMetricsData;

export interface AdminMetricsResponse {
  success: boolean;
  data: PlatformMetricsData;
}
