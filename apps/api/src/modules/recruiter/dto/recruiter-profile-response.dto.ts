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
  company: CompanyDetailDto;
}

export interface RecruiterProfileResponseDto {
  success: true;
  data: RecruiterProfileData;
}
