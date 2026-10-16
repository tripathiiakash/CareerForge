import { VerificationStatus } from '@prisma/client';
import { SubmitRecruiterOrganizationInput } from '@careerforge/validation';

export type SubmitRecruiterOrganizationDto = SubmitRecruiterOrganizationInput;

export interface RecruiterVerificationData {
  id: string;
  recruiter_id: string;
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
  clarification_requested_at: Date | null;
  rejection_reason: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface RecruiterOrganizationData {
  recruiter_id: string;
  is_approved: boolean;
  is_company_assigned: boolean;
  company: {
    id: string;
    name: string;
    website: string | null;
    logo_url: string | null;
  } | null;
  verification: RecruiterVerificationData | null;
}

export interface RecruiterOrganizationResponseDto {
  success: true;
  data: RecruiterOrganizationData;
}
