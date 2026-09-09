export interface StudentProfileData {
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

export interface StudentProfileResponseDto {
  success: true;
  data: StudentProfileData;
}
