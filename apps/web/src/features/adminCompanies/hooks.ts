import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminCompaniesQueryKey,
  adminRecruitersQueryKey,
  assignRecruiterCompany,
  createAdminCompany,
  listAdminCompanies,
  listAllRecruiters,
  updateAdminCompany,
} from './adminCompanyApi';
import { AssignCompanyPayload, CreateCompanyPayload, ListAllRecruitersQuery, ListCompaniesQuery, UpdateCompanyPayload } from './types';

// ---------------------------------------------------------------------------
// List companies
// ---------------------------------------------------------------------------

export function useAdminCompanies(params?: ListCompaniesQuery) {
  return useQuery({
    queryKey: adminCompaniesQueryKey(params),
    queryFn: () => listAdminCompanies(params),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Create company
// ---------------------------------------------------------------------------

export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCompanyPayload) => createAdminCompany(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Update company
// ---------------------------------------------------------------------------

export function useUpdateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCompanyPayload }) =>
      updateAdminCompany(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] });
    },
  });
}

// ---------------------------------------------------------------------------
// List all recruiters
// ---------------------------------------------------------------------------

export function useAllRecruiters(params?: ListAllRecruitersQuery) {
  return useQuery({
    queryKey: adminRecruitersQueryKey(params),
    queryFn: () => listAllRecruiters(params),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Assign company to recruiter
// ---------------------------------------------------------------------------

export function useAssignRecruiterCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      recruiterId,
      payload,
    }: {
      recruiterId: string;
      payload: AssignCompanyPayload;
    }) => assignRecruiterCompany(recruiterId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] });
      // Also invalidate recruiter approvals list so company shows updated there
      queryClient.invalidateQueries({ queryKey: ['admin', 'recruiters'] });
    },
  });
}
