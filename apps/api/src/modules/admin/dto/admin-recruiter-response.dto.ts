import {
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
  message: string;
}

export interface ModerateRecruiterResponseDto {
  success: true;
  data: ModerateRecruiterResult;
}

export type ListPendingRecruitersQueryDto = ListPendingRecruitersQueryInput;
export type ModerateRecruiterDto = ModerateRecruiterStatusInput;
