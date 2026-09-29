import { apiClient, extractApiError } from '@/lib/api';
import {
  AdminCompany,
  AssignCompanyData,
  AssignCompanyPayload,
  AssignCompanyResponse,
  AdminCompanySingleResponse,
  AdminRecruiterItem,
  AdminRecruiterMeta,
  CreateCompanyPayload,
  ListAllRecruitersQuery,
  ListAllRecruitersResponse,
  ListCompaniesQuery,
  ListCompaniesResponse,
  AdminCompanyMeta,
  UpdateCompanyPayload,
} from './types';

export { extractApiError };

// ---------------------------------------------------------------------------
// Query key factories
// ---------------------------------------------------------------------------

export function adminCompaniesQueryKey(params?: ListCompaniesQuery) {
  return ['admin', 'companies', params ?? {}] as const;
}

export function adminRecruitersQueryKey(params?: ListAllRecruitersQuery) {
  return ['admin', 'companies', 'recruiters', params ?? {}] as const;
}

// ---------------------------------------------------------------------------
// List companies
// ---------------------------------------------------------------------------

export async function listAdminCompanies(
  params?: ListCompaniesQuery
): Promise<{ data: AdminCompany[]; meta: AdminCompanyMeta }> {
  const response = await apiClient.get<ListCompaniesResponse>(
    '/admin/companies',
    { params }
  );
  return { data: response.data.data, meta: response.data.meta };
}

// ---------------------------------------------------------------------------
// Create company
// ---------------------------------------------------------------------------

export async function createAdminCompany(
  payload: CreateCompanyPayload
): Promise<AdminCompany> {
  const response = await apiClient.post<AdminCompanySingleResponse>(
    '/admin/companies',
    payload
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Update company
// ---------------------------------------------------------------------------

export async function updateAdminCompany(
  id: string,
  payload: UpdateCompanyPayload
): Promise<AdminCompany> {
  const response = await apiClient.patch<AdminCompanySingleResponse>(
    `/admin/companies/${encodeURIComponent(id)}`,
    payload
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// List all recruiters (for assignment panel)
// ---------------------------------------------------------------------------

export async function listAllRecruiters(
  params?: ListAllRecruitersQuery
): Promise<{ data: AdminRecruiterItem[]; meta: AdminRecruiterMeta }> {
  const response = await apiClient.get<ListAllRecruitersResponse>(
    '/admin/companies/recruiters',
    { params }
  );
  return { data: response.data.data, meta: response.data.meta };
}

// ---------------------------------------------------------------------------
// Assign company to recruiter
// ---------------------------------------------------------------------------

export async function assignRecruiterCompany(
  recruiterId: string,
  payload: AssignCompanyPayload
): Promise<AssignCompanyData> {
  const response = await apiClient.patch<AssignCompanyResponse>(
    `/admin/companies/recruiters/${encodeURIComponent(recruiterId)}/assign`,
    payload
  );
  return response.data.data;
}
