import { apiClient } from '@/lib/api';
import {
  ApplicationFilterParams,
  ApplicationsPaginationMeta,
  ListStudentApplicationsResponse,
  StudentApplicationItem,
} from './types';

/**
 * Builds clean query parameters conforming to docs/API.md §2.3.
 * Omits undefined, empty, or unselected values.
 */
export function buildApplicationsQueryParams(
  params: ApplicationFilterParams = {}
): Record<string, string | number> {
  const query: Record<string, string | number> = {};

  if (params.page && params.page > 0) {
    query.page = params.page;
  }

  if (params.limit && params.limit > 0 && params.limit <= 50) {
    query.limit = params.limit;
  }

  if (
    params.status &&
    ['APPLIED', 'SHORTLISTED', 'REJECTED'].includes(params.status)
  ) {
    query.status = params.status;
  }

  return query;
}

/**
 * Fetches the paginated list of applications for the authenticated student adhering to docs/API.md §2.3.
 */
export async function listStudentApplications(
  params: ApplicationFilterParams = {}
): Promise<{
  data: StudentApplicationItem[];
  meta: ApplicationsPaginationMeta;
}> {
  const query = buildApplicationsQueryParams(params);
  const response = await apiClient.get<ListStudentApplicationsResponse>(
    '/students/me/applications',
    {
      params: query,
    }
  );

  return {
    data: response.data.data || [],
    meta: response.data.meta || {
      total: 0,
      page: params.page || 1,
      limit: params.limit || 10,
      totalPages: 0,
    },
  };
}
