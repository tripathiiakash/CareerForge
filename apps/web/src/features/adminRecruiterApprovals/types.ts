/**
 * Domain & API types for Admin Recruiter Approvals.
 */

export interface PendingRecruiterCompany {
  id: string;
  name: string;
  website?: string | null;
  logo_url?: string | null;
}

export interface PendingRecruiterUser {
  id: string;
  email: string;
  is_banned: boolean;
  created_at: string;
}

export interface PendingRecruiterVerification {
  id: string;
  organization_name: string;
  website_url: string | null;
  linkedin_url: string | null;
  designation: string | null;
  description: string | null;
  evidence_file_key: string | null;
  evidence_original_name: string | null;
  evidence_mime_type: string | null;
  evidence_size_bytes: number | null;
  status: 'PENDING' | 'NEEDS_CLARIFICATION' | 'APPROVED' | 'REJECTED';
  clarification_message: string | null;
  clarification_requested_at: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
}

export interface PendingRecruiter {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_approved: boolean;
  created_at: string;
  company: PendingRecruiterCompany | null;
  user?: PendingRecruiterUser | null;
  verification?: PendingRecruiterVerification | null;
}

export interface ListPendingRecruitersQuery {
  page?: number;
  limit?: number;
}

export interface ListPendingRecruitersMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListPendingRecruitersResponse {
  success: boolean;
  data: PendingRecruiter[];
  meta: ListPendingRecruitersMeta;
}

export interface ModerateRecruiterData {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  is_approved: boolean;
  message: string;
}

export interface ModerateRecruiterResponse {
  success: boolean;
  data: ModerateRecruiterData;
}
