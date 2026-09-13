export interface AdminUserStudentSummary {
  first_name: string;
  last_name: string;
}

export interface AdminUserRecruiterCompanySummary {
  name: string;
}

export interface AdminUserRecruiterSummary {
  first_name: string;
  last_name: string;
  company: AdminUserRecruiterCompanySummary | null;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  role: string;
  is_banned: boolean;
  created_at: Date | string;
  student?: AdminUserStudentSummary | null;
  recruiter?: AdminUserRecruiterSummary | null;
}

export interface ListUsersPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListUsersResponseDto {
  success: true;
  data: AdminUserListItem[];
  meta: ListUsersPaginationMeta;
}

export interface DeleteUserResponseDto {
  success: true;
  message: string;
}
