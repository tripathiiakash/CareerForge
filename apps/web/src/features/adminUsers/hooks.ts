import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminUsersBaseKey,
  adminUsersQueryKey,
  deleteAdminUser,
  getAdminUsers,
} from './adminUsersApi';
import {
  AdminUser,
  DeleteAdminUserResponse,
  ListAdminUsersMeta,
  ListAdminUsersQuery,
} from './types';

export type DeleteUserVariables = string | { userId: string };

/**
 * Hook to retrieve paginated platform users for administrative moderation.
 * Adheres strictly to docs/API.md §9.3.
 */
export function useAdminUsers(params?: ListAdminUsersQuery) {
  return useQuery<{ data: AdminUser[]; meta: ListAdminUsersMeta }, Error>({
    queryKey: adminUsersQueryKey(params),
    queryFn: () => getAdminUsers(params),
    staleTime: 30 * 1000,
    placeholderData: (previousData) => previousData,
    retry: 1,
  });
}

/**
 * Hook to delete a platform user and their associated data.
 * Adheres strictly to docs/API.md §9.4.
 * Server is authoritative; invalidates admin user list on success.
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation<DeleteAdminUserResponse, Error, DeleteUserVariables>({
    mutationFn: (variables: DeleteUserVariables) => {
      const id = typeof variables === 'string' ? variables : variables.userId;
      return deleteAdminUser(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminUsersBaseKey(),
      });
    },
  });
}
