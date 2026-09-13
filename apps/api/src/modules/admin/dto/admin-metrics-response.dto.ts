/**
 * Response DTOs for Admin Platform Analytics & Metrics.
 * Adheres strictly to docs/API.md §9.5.
 */

export interface PlatformMetricsData {
  total_students: number;
  total_recruiters: number;
  active_jobs: number;
  pending_jobs: number;
  total_applications: number;
}

export interface AdminMetricsResponseDto {
  success: true;
  data: PlatformMetricsData;
}
