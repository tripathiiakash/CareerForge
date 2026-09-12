export interface StudentProfile {
  id: string;
  first_name: string;
  last_name: string;
  university: string | null;
  graduation_year: number | null;
  degree: string | null;
  skills: string[];
  github_url: string | null;
  linkedin_url: string | null;
}

export interface StudentProfileResponse {
  success: boolean;
  data: StudentProfile;
}

export interface StudentProfileFormValues {
  first_name: string;
  last_name: string;
  university?: string;
  graduation_year?: number | string;
  degree?: string;
  skills?: string;
  github_url?: string;
  linkedin_url?: string;
}
