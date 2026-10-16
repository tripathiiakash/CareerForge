import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminPendingRecruitersBaseKey,
  adminPendingRecruitersQueryKey,
  approveRecruiter,
  getPendingRecruiters,
  rejectRecruiter,
  requestRecruiterClarification,
} from './adminRecruiterApi';
import { ListPendingRecruitersQuery } from './types';

/**
 * Hook to fetch paginated pending recruiters.
 */
export function usePendingRecruiters(params?: ListPendingRecruitersQuery) {
  return useQuery({
    queryKey: adminPendingRecruitersQueryKey(params),
    queryFn: () => getPendingRecruiters(params),
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to approve a recruiter account.
 */
export function useApproveRecruiter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recruiterId: string) => approveRecruiter(recruiterId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminPendingRecruitersBaseKey(),
      });
      queryClient.invalidateQueries({
        queryKey: ['admin', 'users'],
      });
      queryClient.invalidateQueries({
        queryKey: ['admin', 'metrics'],
      });
    },
  });
}

/**
 * Hook to reject a recruiter account.
 */
export function useRejectRecruiter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      payload: string | { recruiterId: string; reason?: string }
    ) => {
      if (typeof payload === 'string') {
        return rejectRecruiter(payload);
      }
      return rejectRecruiter(payload.recruiterId, payload.reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminPendingRecruitersBaseKey(),
      });
      queryClient.invalidateQueries({
        queryKey: ['admin', 'users'],
      });
      queryClient.invalidateQueries({
        queryKey: ['admin', 'metrics'],
      });
    },
  });
}

/**
 * Hook to request clarification from a recruiter on their organization verification.
 */
export function useRequestClarification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      recruiterId,
      message,
    }: {
      recruiterId: string;
      message: string;
    }) => requestRecruiterClarification(recruiterId, message),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminPendingRecruitersBaseKey(),
      });
      queryClient.invalidateQueries({
        queryKey: ['admin', 'users'],
      });
      queryClient.invalidateQueries({
        queryKey: ['admin', 'metrics'],
      });
    },
  });
}
