export interface CompanyDetailDto {
  id: string;
  name: string;
  website: string | null;
  logo_url: string | null;
}

export interface RecruiterProfileData {
  id: string;
  first_name: string;
  last_name: string;
  is_approved: boolean;
  /**
   * The linked company record. Always present (never null) because a placeholder
   * company is created on registration. Use `is_company_assigned` to determine
   * whether an admin has bound the recruiter to an organization.
   */
  company: CompanyDetailDto;
  /**
   * True when the recruiter has been assigned to a company with a non-empty name.
   * False when only the placeholder (empty-name) company exists from registration.
   */
  is_company_assigned: boolean;
}

export interface RecruiterProfileResponseDto {
  success: true;
  data: RecruiterProfileData;
}
