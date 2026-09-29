import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminPendingRecruitersBaseKey,
  adminPendingRecruitersQueryKey,
  approveRecruiter,
  getPendingRecruiters,
  rejectRecruiter,
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
    mutationFn: (recruiterId: string) => rejectRecruiter(recruiterId),
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
