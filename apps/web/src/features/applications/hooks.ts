import { useQuery } from '@tanstack/react-query';
import { listStudentApplications } from './applicationsApi';
import {
  ApplicationFilterParams,
  ApplicationsPaginationMeta,
  StudentApplicationItem,
} from './types';

export const STUDENT_APPLICATIONS_QUERY_KEY = [
  'student',
  'applications',
] as const;

/**
 * Hook to retrieve the authenticated student's applications with filtering and pagination.
 */
export function useStudentApplications(params: ApplicationFilterParams) {
  return useQuery<
    { data: StudentApplicationItem[]; meta: ApplicationsPaginationMeta },
    Error
  >({
    queryKey: [...STUDENT_APPLICATIONS_QUERY_KEY, 'list', params],
    queryFn: () => listStudentApplications(params),
    staleTime: 60 * 1000,
    placeholderData: (previousData) => previousData,
    retry: 1,
  });
}
