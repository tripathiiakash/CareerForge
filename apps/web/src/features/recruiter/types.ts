export interface CompanyDetail {
  id: string;
  name: string;
  website: string | null;
  logo_url: string | null;
}

export interface RecruiterProfile {
  id: string;
  first_name: string;
  last_name: string;
  is_approved: boolean;
  company: CompanyDetail;
  /** True when an admin has assigned a company; false on registration placeholder. */
  is_company_assigned: boolean;
}

export interface RecruiterProfileResponse {
  success: boolean;
  data: RecruiterProfile;
}

export interface RecruiterProfileFormValues {
  first_name: string;
  last_name: string;
}
