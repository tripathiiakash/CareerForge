/**
 * Domain & API types for Admin User Management.
 * Adheres strictly to docs/API.md §9.3 and §9.4 and backend DTOs.
 */

export type AdminUserRole = 'STUDENT' | 'RECRUITER' | 'ADMIN';

export type AdminUserFilterRole = 'STUDENT' | 'RECRUITER';

export interface AdminUserStudentProfile {
  first_name: string;
  last_name: string;
}

export interface AdminUserCompany {
  name: string;
}

export interface AdminUserRecruiterProfile {
  first_name: string;
  last_name: string;
  company: AdminUserCompany | null;
}

export interface AdminUser {
  id: string;
  email: string;
  role: AdminUserRole;
  is_banned: boolean;
  created_at: string;
  student: AdminUserStudentProfile | null;
  recruiter: AdminUserRecruiterProfile | null;
}

export interface ListAdminUsersQuery {
  page?: number;
  limit?: number;
  role?: AdminUserFilterRole;
  search?: string;
}

export interface ListAdminUsersMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListAdminUsersResponse {
  success: boolean;
  data: AdminUser[];
  meta: ListAdminUsersMeta;
}

export interface DeleteAdminUserResponse {
  success: boolean;
  message: string;
}
