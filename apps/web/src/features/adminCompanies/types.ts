/**
 * Domain and API types for Admin Company Management.
 */

export interface AdminCompany {
  id: string;
  name: string;
  website: string | null;
  logo_url: string | null;
  created_at: string;
  recruiter_count: number;
}

export interface AdminCompanyMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListCompaniesQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface ListCompaniesResponse {
  success: boolean;
  data: AdminCompany[];
  meta: AdminCompanyMeta;
}

export interface AdminCompanySingleResponse {
  success: boolean;
  data: AdminCompany;
}

// ---- Recruiter list (for assignment) ----

export interface RecruiterCompanySummary {
  id: string;
  name: string;
  website?: string | null;
  logo_url?: string | null;
}

export interface AdminRecruiterItem {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_approved: boolean;
  created_at: string;
  company: RecruiterCompanySummary | null;
}

export interface AdminRecruiterMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListAllRecruitersQuery {
  page?: number;
  limit?: number;
  is_approved?: boolean;
  search?: string;
}

export interface ListAllRecruitersResponse {
  success: boolean;
  data: AdminRecruiterItem[];
  meta: AdminRecruiterMeta;
}

// ---- Assign company ----

export interface AssignCompanyPayload {
  company_id: string;
}

export interface AssignCompanyData {
  recruiter_id: string;
  company_id: string;
  company_name: string;
  message: string;
}

export interface AssignCompanyResponse {
  success: boolean;
  data: AssignCompanyData;
}

// ---- Create / Update company ----

export interface CreateCompanyPayload {
  name: string;
  website?: string | null;
  logo_url?: string | null;
}

export interface UpdateCompanyPayload {
  name?: string;
  website?: string | null;
  logo_url?: string | null;
}
