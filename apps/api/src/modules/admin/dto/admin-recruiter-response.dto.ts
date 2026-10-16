import {
  ApproveRecruiterInput,
  ListPendingRecruitersQueryInput,
  ModerateRecruiterStatusInput,
} from '@careerforge/validation';

export interface AdminPendingRecruiterCompanySummary {
  id: string;
  name: string;
  website: string | null;
  logo_url: string | null;
}

export interface AdminPendingRecruiterUserSummary {
  id: string;
  email: string;
  is_banned: boolean;
  created_at: Date | string;
}

export interface AdminRecruiterVerificationSummary {
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
  clarification_requested_at: Date | string | null;
  rejection_reason: string | null;
  reviewed_at: Date | string | null;
}

export interface AdminPendingRecruiterItem {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_approved: boolean;
  created_at: Date | string;
  company: AdminPendingRecruiterCompanySummary | null;
  user?: AdminPendingRecruiterUserSummary | null;
  verification?: AdminRecruiterVerificationSummary | null;
}

export interface ListPendingRecruitersPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListPendingRecruitersResponseDto {
  success: true;
  data: AdminPendingRecruiterItem[];
  meta: ListPendingRecruitersPaginationMeta;
}

export interface ModerateRecruiterResult {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  is_approved: boolean;
  status?: string;
  company_id?: string;
  company_name?: string;
  message: string;
}

export interface ModerateRecruiterResponseDto {
  success: true;
  data: ModerateRecruiterResult;
}

export interface RequestClarificationDto {
  message: string;
}

export interface RejectRecruiterDto {
  reason: string;
}

export type ListPendingRecruitersQueryDto = ListPendingRecruitersQueryInput;
export type ModerateRecruiterDto = ModerateRecruiterStatusInput;
export type ApproveRecruiterDto = ApproveRecruiterInput;
