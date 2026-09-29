import {
  AssignRecruiterCompanyInput,
  CreateCompanyInput,
  ListAllRecruitersQueryInput,
  ListCompaniesQueryInput,
  UpdateCompanyInput,
} from '@careerforge/validation';

// ---------------------------------------------------------------------------
// Company item shapes
// ---------------------------------------------------------------------------

export interface AdminCompanyItem {
  id: string;
  name: string;
  website: string | null;
  logo_url: string | null;
  created_at: Date | string;
  recruiter_count: number;
}

export interface AdminCompanyPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// List companies
// ---------------------------------------------------------------------------

export interface ListCompaniesResponseDto {
  success: true;
  data: AdminCompanyItem[];
  meta: AdminCompanyPaginationMeta;
}

// ---------------------------------------------------------------------------
// Single company response (create / update)
// ---------------------------------------------------------------------------

export interface AdminCompanyResponseDto {
  success: true;
  data: AdminCompanyItem;
}

// ---------------------------------------------------------------------------
// Recruiter item shapes (for assignment UI)
// ---------------------------------------------------------------------------

export interface AdminRecruiterListItem {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_approved: boolean;
  created_at: Date | string;
  company: {
    id: string;
    name: string;
    website: string | null;
    logo_url: string | null;
  } | null;
}

export interface AdminRecruiterListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListAllRecruitersResponseDto {
  success: true;
  data: AdminRecruiterListItem[];
  meta: AdminRecruiterListMeta;
}

// ---------------------------------------------------------------------------
// Assign company result
// ---------------------------------------------------------------------------

export interface AssignRecruiterCompanyResult {
  recruiter_id: string;
  company_id: string;
  company_name: string;
  message: string;
}

export interface AssignRecruiterCompanyResponseDto {
  success: true;
  data: AssignRecruiterCompanyResult;
}

// ---------------------------------------------------------------------------
// DTO type aliases (map validation inputs -> NestJS DTOs)
// ---------------------------------------------------------------------------

export type ListCompaniesQueryDto = ListCompaniesQueryInput;
export type CreateAdminCompanyDto = CreateCompanyInput;
export type UpdateAdminCompanyDto = UpdateCompanyInput;
export type AssignRecruiterCompanyDto = AssignRecruiterCompanyInput;
export type ListAllRecruitersQueryDto = ListAllRecruitersQueryInput;
