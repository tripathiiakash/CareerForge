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

export type VerificationStatus =
  'PENDING' | 'NEEDS_CLARIFICATION' | 'APPROVED' | 'REJECTED';

export interface RecruiterVerificationSubmission {
  id: string;
  organization_name: string;
  website_url: string | null;
  linkedin_url: string | null;
  designation: string | null;
  description: string | null;
  evidence_file_key: string | null;
  evidence_original_name: string | null;
  evidence_mime_type: string | null;
  evidence_size_bytes: number | null;
  status: VerificationStatus;
  clarification_message: string | null;
  clarification_requested_at: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  is_submitted: boolean;
}

export interface RecruiterVerificationResponse {
  success: boolean;
  data: any;
}

export interface RecruiterOrganizationFormValues {
  organization_name: string;
  website_url?: string;
  linkedin_url?: string;
  designation?: string;
  description?: string;
}
